package proxy

import (
	"context"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/gatelog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/meta"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/toolcall"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func callBackendFromRequest(ctx context.Context, backend *mcp.ClientSession, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	result, callMeta, err := toolcall.Call(ctx, backend, req.Params.Name, req.Params.Arguments)
	if err == nil && !meta.IsMeta(req.Params.Name) {
		gatelog.LogToolCall(req.Params.Name, callMeta.ResponseBytes, callMeta.Compressed, callMeta.SavedBytes)
	}
	return result, err
}
