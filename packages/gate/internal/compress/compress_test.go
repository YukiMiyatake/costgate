package compress

import (
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMaybeCompressDisabled(t *testing.T) {
	t.Setenv("COSTGATE_COMPRESS", "0")
	text := strings.Repeat("x", 20000)
	result := &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
	out, stats := MaybeCompress("get_file_contents", result)
	if stats.Applied {
		t.Fatal("expected no compression when disabled")
	}
	if out.Content[0].(*mcp.TextContent).Text != text {
		t.Fatal("text should be unchanged")
	}
}

func TestMaybeCompressTruncatesLargeText(t *testing.T) {
	t.Setenv("COSTGATE_COMPRESS", "1")
	t.Setenv("COSTGATE_COMPRESS_MAX_CHARS", "1000")
	text := strings.Repeat("a", 5000) + strings.Repeat("b", 5000)
	result := &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
	out, stats := MaybeCompress("get_file_contents", result)
	if !stats.Applied {
		t.Fatal("expected compression")
	}
	if stats.AfterChars > 1000 {
		t.Fatalf("after=%d want <=1000", stats.AfterChars)
	}
	compressed := out.Content[0].(*mcp.TextContent).Text
	if !strings.Contains(compressed, "[costgate: truncated") {
		t.Fatal("expected truncation marker")
	}
}

func TestMaybeCompressSmallTextUnchanged(t *testing.T) {
	t.Setenv("COSTGATE_COMPRESS", "1")
	t.Setenv("COSTGATE_COMPRESS_MAX_CHARS", "1000")
	text := "hello"
	result := &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
	out, stats := MaybeCompress("search", result)
	if stats.Applied {
		t.Fatal("small text should not compress")
	}
	if out.Content[0].(*mcp.TextContent).Text != text {
		t.Fatal("text changed unexpectedly")
	}
}
