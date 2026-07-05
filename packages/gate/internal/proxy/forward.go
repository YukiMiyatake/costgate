package proxy

import (
	"context"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/toolcall"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func callBackendFromRequest(ctx context.Context, backend *mcp.ClientSession, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return toolcall.Call(ctx, backend, req.Params.Name, req.Params.Arguments)
}
