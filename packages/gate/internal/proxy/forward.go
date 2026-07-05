package proxy

import (
	"context"

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

func (fc *forwardContext) shieldHandler() *shield.Handler {
	if fc == nil {
		return nil
	}
	return fc.shield
}

func callBackendFromRequest(ctx context.Context, backend *mcp.ClientSession, req *mcp.CallToolRequest, fc *forwardContext) (*mcp.CallToolResult, error) {
	var h *shield.Handler
	backendName := ""
	if fc != nil {
		h = fc.shield
		backendName = fc.backendName
	}
	result, callMeta, err := shield.CallTool(ctx, backend, backendName, h, req.Params.Name, req.Params.Arguments)
	if err == nil && !meta.IsMeta(req.Params.Name) {
		gatelog.LogToolCall(req.Params.Name, callMeta.ResponseBytes, callMeta.Compressed, callMeta.SavedBytes)
	}
	return result, err
}
