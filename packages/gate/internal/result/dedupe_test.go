package result

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMaybeDedupe(t *testing.T) {
	ResetDedupeCache()
	t.Setenv("COSTGATE_DEDUPE", "1")

	args := json.RawMessage(`{"path":"main.go"}`)
	result := &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: "same content"}},
	}

	first := maybeDedupe("read_file", args, result)
	if strings.Contains(first.Content[0].(*mcp.TextContent).Text, "dedupe cache hit") {
		t.Fatal("first call should not be cache hit")
	}

	second := maybeDedupe("read_file", args, result)
	if !strings.Contains(second.Content[0].(*mcp.TextContent).Text, "dedupe cache hit") {
		t.Fatal("second identical call should hit cache")
	}
}

func TestMaybeDedupeDisabled(t *testing.T) {
	ResetDedupeCache()
	t.Setenv("COSTGATE_DEDUPE", "0")

	args := json.RawMessage(`{"path":"x"}`)
	result := &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: "data"}},
	}
	second := maybeDedupe("read_file", args, result)
	second = maybeDedupe("read_file", args, result)
	if strings.Contains(second.Content[0].(*mcp.TextContent).Text, "dedupe cache hit") {
		t.Fatal("dedupe disabled")
	}
}
