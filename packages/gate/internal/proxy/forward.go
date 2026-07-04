package proxy

import (
	"context"
	"encoding/json"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func callBackend(ctx context.Context, backend *mcp.ClientSession, name string, rawArgs json.RawMessage) (*mcp.CallToolResult, error) {
	params := &mcp.CallToolParams{Name: name}
	if len(rawArgs) > 0 {
		var args any
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return nil, err
		}
		params.Arguments = args
	}
	return backend.CallTool(ctx, params)
}

func callBackendFromRequest(ctx context.Context, backend *mcp.ClientSession, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return callBackend(ctx, backend, req.Params.Name, req.Params.Arguments)
}
