package catalog

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// BackendRegistry lists connected backend MCP sessions.
type BackendRegistry interface {
	Names() []string
	Session(name string) (*mcp.ClientSession, bool)
	Single() bool
}

// LoadMulti merges tools from all backends in the registry.
// Single-backend configs keep unqualified tool names for backward compatibility.
func LoadMulti(ctx context.Context, registry BackendRegistry) (*Catalog, error) {
	if registry == nil || len(registry.Names()) == 0 {
		return nil, fmt.Errorf("no backends in registry")
	}
	qualify := !registry.Single()
	var allTools []*mcp.Tool
	byName := make(map[string]*mcp.Tool)
	backendNames := registry.Names()

	for _, backendName := range backendNames {
		session, ok := registry.Session(backendName)
		if !ok {
			return nil, fmt.Errorf("missing session for backend %q", backendName)
		}
		cat, err := Load(ctx, session, backendName)
		if err != nil {
			return nil, fmt.Errorf("load %s: %w", backendName, err)
		}
		for _, tool := range cat.Tools {
			if tool == nil {
				continue
			}
			var exposed *mcp.Tool
			if qualify {
				exposed = QualifyTool(backendName, tool)
			} else {
				copy := *tool
				exposed = &copy
			}
			allTools = append(allTools, exposed)
			byName[exposed.Name] = exposed
		}
	}

	return &Catalog{
		Backend: strings.Join(backendNames, ","),
		Tools:   allTools,
		byName:  byName,
	}, nil
}
