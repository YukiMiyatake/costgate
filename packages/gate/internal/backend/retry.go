package backend

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// IsURLBackend reports whether cfg uses HTTP transport.
func IsURLBackend(cfg config.BackendConfig) bool {
	return strings.TrimSpace(cfg.URL) != ""
}

// IsRetryableMCPError reports transport-level failures worth one reconnect retry.
func IsRetryableMCPError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "sse") ||
		strings.Contains(msg, "connection closed") ||
		strings.Contains(msg, "connection failed") ||
		strings.Contains(msg, "without progress") ||
		strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "eof")
}

// CallTool invokes a backend tool, reconnecting URL backends once on transport failure.
func CallTool(
	ctx context.Context,
	registry *Registry,
	backendName string,
	session *mcp.ClientSession,
	tool string,
	rawArgs json.RawMessage,
) (*mcp.CallToolResult, error) {
	if registry != nil && registry.IsURL(backendName) {
		if idleErr := registry.ReconnectIfIdle(ctx, backendName); idleErr != nil {
			return nil, idleErr
		}
		if fresh, ok := registry.Session(backendName); ok && fresh != nil {
			session = fresh
		}
	}

	result, err := callToolOnce(ctx, session, tool, rawArgs)
	if err == nil {
		if registry != nil {
			registry.MarkBackendUsed(backendName)
		}
		return result, nil
	}
	if registry == nil || !registry.IsURL(backendName) || !IsRetryableMCPError(err) {
		return result, err
	}

	log.Printf("[costgate-gate] backend %s: reconnecting after tool error: %v", backendName, err)
	if reconnErr := registry.Reconnect(ctx, backendName); reconnErr != nil {
		return nil, fmt.Errorf("%w (reconnect failed: %v)", err, reconnErr)
	}
	session, ok := registry.Session(backendName)
	if !ok || session == nil {
		return nil, err
	}
	result, err = callToolOnce(ctx, session, tool, rawArgs)
	if err == nil && registry != nil {
		registry.MarkBackendUsed(backendName)
	}
	return result, err
}

func callToolOnce(ctx context.Context, session *mcp.ClientSession, tool string, rawArgs json.RawMessage) (*mcp.CallToolResult, error) {
	params := &mcp.CallToolParams{Name: tool}
	if len(rawArgs) > 0 {
		var args any
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return nil, err
		}
		params.Arguments = args
	}
	return session.CallTool(ctx, params)
}
