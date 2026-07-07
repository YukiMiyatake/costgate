package proxy

import (
	"context"
	"log"
	"sync"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/codemode"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/compress"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/gatelog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/intent"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/meta"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/shield"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// filterRuntime manages dynamic tools/list exposure for filter mode.
type filterRuntime struct {
	server   *mcp.Server
	cat      *catalog.Catalog
	tiers    map[string]filter.Tier
	registry *backend.Registry
	store    *usage.Store
	static   string
	fcs      map[string]*forwardContext
	live     map[string]bool
	syncMu   sync.Mutex
}

func newFilterRuntime(
	server *mcp.Server,
	cat *catalog.Catalog,
	tiers map[string]filter.Tier,
	registry *backend.Registry,
	store *usage.Store,
	staticIntent string,
	fcs map[string]*forwardContext,
) *filterRuntime {
	r := &filterRuntime{
		server:   server,
		cat:      cat,
		tiers:    tiers,
		registry: registry,
		store:    store,
		static:   staticIntent,
		fcs:      fcs,
		live:     map[string]bool{},
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
	return r
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

func (r *filterRuntime) syncTools() {
	r.syncMu.Lock()
	defer r.syncMu.Unlock()

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
		if r.tiers[name] == filter.TierB {
			toRemove = append(toRemove, name)
		}
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
		"[costgate-gate] filter mode: exposed=%d meta=2 total=%d tiers(A=%d B=%d C=%d hidden=%d) intent=%q exposure=%s slim_list=%v dynamic=%v compress=%v codemode=%v shield=%v backends=[%s]",
		r.exposedCount(), len(r.cat.Tools), a, b, c, h, intentText, filter.ResolveExposureMode(), filter.SlimListEnabled(), intent.DynamicEnabled(), compress.Enabled(), codemode.Enabled(), shield.Enabled(), r.registry.String(),
	)
}
