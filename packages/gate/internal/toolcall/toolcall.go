package toolcall

import (
	"context"
	"encoding/json"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/result"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Call invokes a backend tool and applies code-mode + compression when enabled.
func Call(
	ctx context.Context,
	registry *backend.Registry,
	backendName string,
	session *mcp.ClientSession,
	name string,
	rawArgs json.RawMessage,
) (*mcp.CallToolResult, result.Meta, error) {
	raw, err := backend.CallTool(ctx, registry, backendName, session, name, rawArgs)
	if err != nil {
		return nil, result.Meta{}, err
	}
	out, meta := result.Process(name, rawArgs, raw)
	return out, meta, nil
}
