package meta

import (
	"encoding/json"
	"testing"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestHandleDiscoverInList(t *testing.T) {
	cat := &catalog.Catalog{
		Tools: []*mcp.Tool{
			{Name: "always_on", Description: "tier A tool"},
			{Name: "hidden_tool", Description: "tier C tool"},
		},
	}
	tiers := map[string]filter.Tier{
		"always_on":   filter.TierA,
		"hidden_tool": filter.TierC,
	}
	live := map[string]bool{"always_on": true}

	raw, err := json.Marshal(map[string]any{"query": "tool", "limit": 10})
	if err != nil {
		t.Fatal(err)
	}

	result, err := handleDiscover(cat, tiers, func(name string) bool {
		return live[name]
	}, raw)
	if err != nil {
		t.Fatal(err)
	}
	text := result.Content[0].(*mcp.TextContent).Text

	var items []struct {
		Name   string `json:"name"`
		InList bool   `json:"in_tools_list"`
	}
	if err := json.Unmarshal([]byte(text), &items); err != nil {
		t.Fatal(err)
	}

	byName := map[string]bool{}
	for _, item := range items {
		byName[item.Name] = item.InList
	}
	if !byName["always_on"] {
		t.Error("always_on should be in_tools_list=true")
	}
	if byName["hidden_tool"] {
		t.Error("hidden_tool should be in_tools_list=false")
	}
}

func TestHandleDiscoverInListNilCallback(t *testing.T) {
	cat := &catalog.Catalog{
		Tools: []*mcp.Tool{{Name: "x", Description: "test"}},
	}
	tiers := map[string]filter.Tier{"x": filter.TierA}
	raw := json.RawMessage(`{"query":"x"}`)

	result, err := handleDiscover(cat, tiers, nil, raw)
	if err != nil {
		t.Fatal(err)
	}
	_ = result
}

func TestIsMeta(t *testing.T) {
	if !IsMeta(ToolDiscover) || !IsMeta(ToolInvoke) {
		t.Error("expected meta tools")
	}
	if IsMeta("get_file_contents") {
		t.Error("backend tool should not be meta")
	}
}
