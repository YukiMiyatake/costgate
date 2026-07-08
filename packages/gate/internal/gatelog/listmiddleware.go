package gatelog

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const methodListTools = "tools/list"

// InstallToolsListLogging records each client tools/list RPC in gate JSONL.
func InstallToolsListLogging(server *mcp.Server, backend string) {
	if server == nil || !Enabled() {
		return
	}
	server.AddReceivingMiddleware(toolsListLoggingMiddleware(backend))
}

func toolsListLoggingMiddleware(backend string) mcp.Middleware {
	return func(next mcp.MethodHandler) mcp.MethodHandler {
		return func(ctx context.Context, method string, req mcp.Request) (mcp.Result, error) {
			result, err := next(ctx, method, req)
			if err != nil || method != methodListTools {
				return result, err
			}
			res, ok := result.(*mcp.ListToolsResult)
			if !ok || res == nil {
				return result, err
			}
			LogToolsList(backend, len(res.Tools), EstimateListTokens(res.Tools))
			return result, err
		}
	}
}
