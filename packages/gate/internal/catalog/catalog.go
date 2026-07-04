package catalog

import (
	"context"
	"fmt"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Catalog holds all tools from a backend MCP server.
type Catalog struct {
	Backend string
	Tools   []*mcp.Tool
	byName  map[string]*mcp.Tool
}

// Load fetches tools/list from the backend session.
func Load(ctx context.Context, backend *mcp.ClientSession, backendName string) (*Catalog, error) {
	result, err := backend.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		return nil, fmt.Errorf("list backend tools: %w", err)
	}
	c := &Catalog{
		Backend: backendName,
		Tools:   result.Tools,
		byName:  make(map[string]*mcp.Tool, len(result.Tools)),
	}
	for _, tool := range result.Tools {
		if tool != nil {
			c.byName[tool.Name] = tool
		}
	}
	return c, nil
}

// Get returns a tool by name.
func (c *Catalog) Get(name string) (*mcp.Tool, bool) {
	t, ok := c.byName[name]
	return t, ok
}

// Search finds tools whose name or description contains the query (case-insensitive).
func (c *Catalog) Search(query string, limit int) []*mcp.Tool {
	if limit <= 0 {
		limit = 8
	}
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return nil
	}

	var matches []*mcp.Tool
	for _, tool := range c.Tools {
		if tool == nil {
			continue
		}
		name := strings.ToLower(tool.Name)
		desc := strings.ToLower(tool.Description)
		if strings.Contains(name, q) || strings.Contains(desc, q) {
			matches = append(matches, tool)
			if len(matches) >= limit {
				break
			}
		}
	}
	return matches
}
