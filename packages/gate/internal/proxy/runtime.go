package proxy

import (
	"context"
	"log"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/intent"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/meta"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// filterRuntime manages dynamic tools/list exposure for filter mode.
type filterRuntime struct {
	server  *mcp.Server
	cat     *catalog.Catalog
	tiers   map[string]filter.Tier
	backend *mcp.ClientSession
	store   *usage.Store
	static  string
	live    map[string]bool
}

func newFilterRuntime(
	server *mcp.Server,
	cat *catalog.Catalog,
	tiers map[string]filter.Tier,
	backend *mcp.ClientSession,
	store *usage.Store,
	staticIntent string,
) *filterRuntime {
	r := &filterRuntime{
		server:  server,
		cat:     cat,
		tiers:   tiers,
		backend: backend,
		store:   store,
		static:  staticIntent,
		live:    map[string]bool{},
	}
	meta.Register(server, cat, tiers, backend, r.record)
	r.syncTools()
	return r
}

func (r *filterRuntime) record(tool string) {
	if meta.IsMeta(tool) {
		return
	}
	r.store.Record(tool)
	if err := r.store.Save(); err != nil {
		log.Printf("[costgate-gate] usage save: %v", err)
	}
	if intent.DynamicEnabled() {
		r.syncTools()
	}
}

func (r *filterRuntime) currentIntent() string {
	return intent.Resolve(r.store, r.static)
}

func (r *filterRuntime) syncTools() {
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
}

func (r *filterRuntime) addTool(tool *mcp.Tool) {
	if tool.InputSchema == nil {
		log.Printf("[costgate-gate] skip tool %q: missing input schema", tool.Name)
		return
	}
	name := tool.Name
	r.server.AddTool(tool, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		result, err := callBackendFromRequest(ctx, r.backend, req)
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
	a, b, c := filter.CountTiers(r.tiers)
	log.Printf(
		"[costgate-gate] filter mode: exposed=%d meta=2 total=%d tiers(A=%d B=%d C=%d) intent=%q dynamic=%v",
		r.exposedCount(), len(r.cat.Tools), a, b, c, intentText, intent.DynamicEnabled(),
	)
}
