package filter

import (
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestPrepareToolForListTruncatesDescription(t *testing.T) {
	t.Setenv("COSTGATE_SLIM_LIST", "1")
	t.Setenv("COSTGATE_SLIM_LIST_MAX_CHARS", "40")

	long := strings.Repeat("word ", 30)
	tool := &mcp.Tool{Name: "search_code", Description: long}
	out := PrepareToolForList(tool)
	if out == tool {
		t.Fatal("expected new tool copy")
	}
	if len(out.Description) > 40 {
		t.Fatalf("description not trimmed: len=%d", len(out.Description))
	}
	if !strings.HasSuffix(out.Description, "...") {
		t.Fatalf("expected ellipsis suffix: %q", out.Description)
	}
}

func TestPrepareToolForListDisabled(t *testing.T) {
	t.Setenv("COSTGATE_SLIM_LIST", "0")
	tool := &mcp.Tool{Name: "x", Description: strings.Repeat("a", 200)}
	if PrepareToolForList(tool) != tool {
		t.Fatal("disabled slim should return original pointer")
	}
}
