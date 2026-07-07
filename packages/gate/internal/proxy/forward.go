package proxy

import (
	"context"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/gatelog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/meta"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/shield"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type forwardContext struct {
	backendName string
	shield      *shield.Handler
}

func newForwardContext(backendName string) (*forwardContext, error) {
	h, err := shield.NewHandler()
	if err != nil {
		return nil, err
	}
	shield.LogStartup(backendName)
	return &forwardContext{backendName: backendName, shield: h}, nil
}

func newForwardContexts(registry *backend.Registry) (map[string]*forwardContext, error) {
	fcs := make(map[string]*forwardContext, registry.Count())
	for _, name := range registry.Names() {
		fc, err := newForwardContext(name)
		if err != nil {
			return nil, err
		}
		fcs[name] = fc
	}
	return fcs, nil
}

func (fc *forwardContext) shieldHandler() *shield.Handler {
	if fc == nil {
		return nil
	}
	return fc.shield
}

func callBackendFromRequest(ctx context.Context, registry *backend.Registry, req *mcp.CallToolRequest, fcs map[string]*forwardContext) (*mcp.CallToolResult, error) {
	session, backendName, rawTool, err := backend.ResolveRoute(registry, req.Params.Name)
	if err != nil {
		return nil, err
	}
	var h *shield.Handler
	if fcs != nil {
		if fc := fcs[backendName]; fc != nil {
			h = fc.shield
		}
	}
	result, callMeta, err := shield.CallTool(ctx, registry, session, backendName, h, rawTool, req.Params.Arguments)
	if meta.IsMeta(req.Params.Name) {
		return result, err
	}
	if err != nil {
		gatelog.LogToolCallError(req.Params.Name, err)
		return result, err
	}
	gatelog.LogToolCall(req.Params.Name, callMeta.ResponseBytes, callMeta.Compressed, callMeta.SavedBytes)
	return result, err
}
