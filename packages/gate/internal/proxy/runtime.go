package proxy

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/codemode"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/compress"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/env"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/gatesettings"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/gatelog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/intent"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/meta"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/overrides"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/shield"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// filterRuntime manages dynamic tools/list exposure for filter mode.
type filterRuntime struct {
	server          *mcp.Server
	cat             *catalog.Catalog
	classifiedTiers map[string]filter.Tier
	tiers           map[string]filter.Tier
	registry        *backend.Registry
	store           *usage.Store
	static          string
	fcs             map[string]*forwardContext
	live            map[string]bool
	overridesMod    time.Time
	settingsMod     time.Time
	syncMu          sync.Mutex
}

func newFilterRuntime(
	server *mcp.Server,
	cat *catalog.Catalog,
	classifiedTiers map[string]filter.Tier,
	tiers map[string]filter.Tier,
	registry *backend.Registry,
	store *usage.Store,
	staticIntent string,
	fcs map[string]*forwardContext,
) *filterRuntime {
	r := &filterRuntime{
		server:          server,
		cat:             cat,
		classifiedTiers: classifiedTiers,
		tiers:           tiers,
		registry:        registry,
		store:           store,
		static:          staticIntent,
		fcs:             fcs,
		live:            map[string]bool{},
	}
	if mod, err := overrides.FileModTime(); err == nil {
		r.overridesMod = mod
	}
	if mod, err := gatesettings.FileModTime(); err == nil {
		r.settingsMod = mod
	}
	shields := make(map[string]*shield.Handler, len(fcs))
	for name, fc := range fcs {
		if fc != nil {
			shields[name] = fc.shieldHandler()
		}
	}
	meta.Register(server, cat, tiers, registry, r.record, func(name string) bool {
		return r.live[name]
	}, shields)
	r.syncTools()
	if env.Bool("COSTGATE_GATE_HOT_RELOAD", true) {
		go r.pollOverrides()
	}
	return r
}

func (r *filterRuntime) pollOverrides() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		r.syncTools()
	}
}

func (r *filterRuntime) record(tool string) {
	if meta.IsMeta(tool) {
		return
	}
	r.store.Record(tool)
	r.store.SaveDebounced()
	if intent.DynamicEnabled() {
		go r.syncTools()
	}
}

func (r *filterRuntime) currentIntent() string {
	return intent.Resolve(r.store, r.static)
}

func (r *filterRuntime) reloadGateSettingsIfChanged() bool {
	if !env.Bool("COSTGATE_GATE_HOT_RELOAD", true) {
		return false
	}
	mod, err := gatesettings.FileModTime()
	if err != nil || mod.Equal(r.settingsMod) {
		return false
	}
	loaded, err := gatesettings.Load()
	if err != nil {
		log.Printf("[costgate-gate] gate settings reload: %v", err)
		return false
	}
	if loaded.GateMode != gateMode() {
		log.Printf("[costgate-gate] gate settings: gate_mode=%q requires Gate restart (running %q)", loaded.GateMode, gateMode())
		r.settingsMod = mod
		return false
	}
	loaded.ApplyToEnv()
	r.static = loaded.StaticIntent
	r.settingsMod = mod
	gen := loaded.Generation()
	gatelog.LogSettingsReload(gen)
	log.Printf("[costgate-gate] gate settings reloaded (generation=%s)", gen)
	return true
}

func (r *filterRuntime) reloadOverridesIfChanged() bool {
	if !env.Bool("COSTGATE_GATE_HOT_RELOAD", true) {
		return false
	}
	mod, err := overrides.FileModTime()
	if err != nil || mod.Equal(r.overridesMod) {
		return false
	}
	ov, err := overrides.Load()
	if err != nil {
		log.Printf("[costgate-gate] tool overrides reload: %v", err)
		return false
	}
	ov.ApplyInPlace(r.classifiedTiers, r.tiers)
	r.overridesMod = mod
	log.Printf("[costgate-gate] tool overrides reloaded (%d entries)", len(ov.Tools))
	return true
}

func (r *filterRuntime) syncTools() {
	r.syncMu.Lock()
	defer r.syncMu.Unlock()

	r.reloadGateSettingsIfChanged()
	r.reloadOverridesIfChanged()

	intentText := r.currentIntent()
	exposed := filter.SelectExposed(r.cat.Tools, r.tiers, intentText)

	desired := make(map[string]*mcp.Tool, len(exposed))
	for _, tool := range exposed {
		if tool != nil {
			desired[tool.Name] = tool
		}
	}

	var toRemove []string
	for name := range r.live {
		if _, ok := desired[name]; ok {
			continue
		}
		toRemove = append(toRemove, name)
	}
	if len(toRemove) > 0 {
		r.server.RemoveTools(toRemove...)
		for _, name := range toRemove {
			delete(r.live, name)
		}
	}

	for name, tool := range desired {
		if r.live[name] {
			continue
		}
		r.addTool(tool)
		r.live[name] = true
	}

	gatelog.LogToolsList(r.registry.String(), len(desired), gatelog.EstimateListTokens(exposed))
}

func (r *filterRuntime) addTool(tool *mcp.Tool) {
	if tool.InputSchema == nil {
		log.Printf("[costgate-gate] skip tool %q: missing input schema", tool.Name)
		return
	}
	name := tool.Name
	r.server.AddTool(tool, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		result, err := callBackendFromRequest(ctx, r.registry, req, r.fcs)
		if err == nil {
			r.record(name)
		}
		return result, err
	})
}

func (r *filterRuntime) exposedCount() int {
	return len(r.live)
}

func (r *filterRuntime) logStartup() {
	intentText := r.currentIntent()
	a, b, c, h := filter.CountTiers(r.tiers)
	log.Printf(
		"[costgate-gate] filter mode: exposed=%d meta=2 total=%d tiers(A=%d B=%d C=%d hidden=%d) intent=%q exposure=%s slim_list=%v hot_reload=%v dynamic=%v compress=%v codemode=%v shield=%v backends=[%s]",
		r.exposedCount(), len(r.cat.Tools), a, b, c, h, intentText, filter.ResolveExposureMode(), filter.SlimListEnabled(), env.Bool("COSTGATE_GATE_HOT_RELOAD", true), intent.DynamicEnabled(), compress.Enabled(), codemode.Enabled(), shield.Enabled(), r.registry.String(),
	)
}
