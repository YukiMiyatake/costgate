package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Run starts a transparent MCP proxy: Cursor stdio ↔ backend session.
func Run(ctx context.Context, backend *mcp.ClientSession, backendName string) error {
	tools, err := backend.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		return fmt.Errorf("list backend tools: %w", err)
	}

	server := mcp.NewServer(&mcp.Implementation{
		Name:    "costgate-gate",
		Version: "0.1.0",
	}, nil)

	for _, tool := range tools.Tools {
		tool := tool
		if tool.InputSchema == nil {
			log.Printf("[costgate-gate] skip tool %q: missing input schema", tool.Name)
			continue
		}
		server.AddTool(tool, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			params := &mcp.CallToolParams{
				Name: req.Params.Name,
				Meta: req.Params.Meta,
			}
			if len(req.Params.Arguments) > 0 {
				var args any
				if err := json.Unmarshal(req.Params.Arguments, &args); err != nil {
					return nil, err
				}
				params.Arguments = args
			}
			return backend.CallTool(ctx, params)
		})
	}

	log.Printf("[costgate-gate] registered %d tools from %s (transparent MVP)", len(tools.Tools), backendName)
	log.Printf("[costgate-gate] proxy listening on stdio")

	if err := server.Run(ctx, &mcp.StdioTransport{}); err != nil {
		return fmt.Errorf("server run: %w", err)
	}
	return nil
}
