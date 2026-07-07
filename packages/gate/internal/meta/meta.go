package meta

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/gatelog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/shield"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	ToolDiscover = "discover_tools"
	ToolInvoke   = "invoke_tool"
)

var discoverSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Keyword to match tool names or descriptions"
    },
    "limit": {
      "type": "integer",
      "description": "Maximum matches to return (default 8)"
    }
  },
  "required": ["query"]
}`)

var invokeSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Backend tool name to call (backend/tool when multiple backends)"
    },
    "arguments": {
      "type": "object",
      "description": "Tool arguments object"
    }
  },
  "required": ["name"]
}`)

// Register adds discover_tools and invoke_tool to the server.
// isListed reports whether a tool is currently in tools/list (live exposure).
func Register(
	server *mcp.Server,
	cat *catalog.Catalog,
	tiers map[string]filter.Tier,
	registry *backend.Registry,
	onInvoke func(tool string),
	isListed func(name string) bool,
	shields map[string]*shield.Handler,
) {
	server.AddTool(&mcp.Tool{
		Name:        ToolDiscover,
		Description: "Find hidden backend tools by keyword. Use invoke_tool to call tools not in tools/list.",
		InputSchema: discoverSchema,
	}, func(_ context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return handleDiscover(cat, tiers, isListed, req.Params.Arguments)
	})

	server.AddTool(&mcp.Tool{
		Name:        ToolInvoke,
		Description: "Call any backend MCP tool by name. Use discover_tools when the tool is missing from tools/list.",
		InputSchema: invokeSchema,
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return handleInvoke(ctx, cat, registry, shields, onInvoke, req.Params.Arguments)
	})
}

func handleDiscover(
	cat *catalog.Catalog,
	tiers map[string]filter.Tier,
	isListed func(name string) bool,
	raw json.RawMessage,
) (*mcp.CallToolResult, error) {
	var args struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &args); err != nil {
			return nil, err
		}
	}
	matches := cat.Search(args.Query, args.Limit)
	type item struct {
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
		Tier        string `json:"tier"`
		InList      bool   `json:"in_tools_list"`
	}
	out := make([]item, 0, len(matches))
	for _, tool := range matches {
		tier := tiers[tool.Name]
		if tier == filter.TierHidden {
			continue
		}
		inList := false
		if isListed != nil {
			inList = isListed(tool.Name)
		}
		out = append(out, item{
			Name:        tool.Name,
			Description: tool.Description,
			Tier:        tier.String(),
			InList:      inList,
		})
	}
	payload, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return nil, err
	}
	text := string(payload)
	if len(out) == 0 {
		text = "[]"
	}
	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}, nil
}

func handleInvoke(ctx context.Context, cat *catalog.Catalog, registry *backend.Registry, shields map[string]*shield.Handler, onInvoke func(string), raw json.RawMessage) (*mcp.CallToolResult, error) {
	var args struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, err
	}
	if args.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if _, ok := cat.Get(args.Name); !ok {
		return nil, fmt.Errorf("unknown tool %q", args.Name)
	}
	session, backendName, rawTool, err := backend.ResolveRoute(registry, args.Name)
	if err != nil {
		return nil, err
	}
	var shieldH *shield.Handler
	if shields != nil {
		shieldH = shields[backendName]
	}
	result, callMeta, err := shield.CallTool(ctx, registry, session, backendName, shieldH, rawTool, args.Arguments)
	if err != nil {
		gatelog.LogToolCallError(args.Name, err)
		return result, err
	}
	if onInvoke != nil {
		onInvoke(args.Name)
	}
	gatelog.LogToolCall(args.Name, callMeta.ResponseBytes, callMeta.Compressed, callMeta.SavedBytes)
	return result, err
}

// IsMeta reports CostGate meta tool names.
func IsMeta(name string) bool {
	return name == ToolDiscover || name == ToolInvoke
}
