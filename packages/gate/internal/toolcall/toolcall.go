package toolcall

import (
	"context"
	"encoding/json"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/compress"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Call invokes a backend tool and applies response compression when enabled.
func Call(ctx context.Context, backend *mcp.ClientSession, name string, rawArgs json.RawMessage) (*mcp.CallToolResult, error) {
	params := &mcp.CallToolParams{Name: name}
	if len(rawArgs) > 0 {
		var args any
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return nil, err
		}
		params.Arguments = args
	}
	result, err := backend.CallTool(ctx, params)
	if err != nil {
		return nil, err
	}
	out, _ := compress.MaybeCompress(name, result)
	return out, nil
}
