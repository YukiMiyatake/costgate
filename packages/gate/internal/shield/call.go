package shield

import (
	"context"
	"encoding/json"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/result"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/toolcall"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// CallTool invokes a backend MCP tool with optional redact/unredact.
func CallTool(
	ctx context.Context,
	registry *backend.Registry,
	session *mcp.ClientSession,
	backendName string,
	h *Handler,
	name string,
	rawArgs json.RawMessage,
) (*mcp.CallToolResult, result.Meta, error) {
	if h != nil && h.DenyCall(backendName) {
		return DenyResult(name), result.Meta{}, nil
	}
	if h != nil {
		rawArgs = h.UnredactArguments(rawArgs)
	}
	out, meta, err := toolcall.Call(ctx, registry, backendName, session, name, rawArgs)
	if err == nil && h != nil {
		out = h.RedactResult(backendName, out)
	}
	return out, meta, err
}
