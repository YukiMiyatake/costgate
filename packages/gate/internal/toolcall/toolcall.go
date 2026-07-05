package toolcall

import (
	"context"
	"encoding/json"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/result"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Call invokes a backend tool and applies code-mode + compression when enabled.
func Call(ctx context.Context, backend *mcp.ClientSession, name string, rawArgs json.RawMessage) (*mcp.CallToolResult, result.Meta, error) {
	params := &mcp.CallToolParams{Name: name}
	if len(rawArgs) > 0 {
		var args any
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return nil, result.Meta{}, err
		}
		params.Arguments = args
	}
	raw, err := backend.CallTool(ctx, params)
	if err != nil {
		return nil, result.Meta{}, err
	}
	out, meta := result.Process(name, rawArgs, raw)
	return out, meta, nil
}
