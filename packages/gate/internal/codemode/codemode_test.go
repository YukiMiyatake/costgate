package codemode

import (
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMaybeTransformGoOutline(t *testing.T) {
	t.Setenv("COSTGATE_CODE_MODE", "1")
	t.Setenv("COSTGATE_CODE_MODE_MIN_CHARS", "500")

	filler := strings.Repeat("// filler\n", 200)
	src := strings.Join([]string{
		"package main",
		"",
		"import \"fmt\"",
		"",
		"func hello() {",
		"  fmt.Println(\"hi\")",
		"}",
		"",
		"type Config struct {",
		"  Name string",
		"}",
		"",
		filler,
	}, "\n")

	result := &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: src}},
	}
	out, stats := MaybeTransform("get_file_contents", "main.go", result)
	if !stats.Applied {
		t.Fatal("expected code-mode transform")
	}
	text := out.Content[0].(*mcp.TextContent).Text
	if !strings.Contains(text, "[costgate code-mode: outline]") {
		t.Fatal("missing outline header")
	}
	if strings.Contains(text, "fmt.Println") {
		t.Fatal("body lines should not appear in outline")
	}
	if !strings.Contains(text, "func hello()") {
		t.Fatal("expected func signature")
	}
	if stats.AfterChars >= stats.BeforeChars {
		t.Fatalf("before=%d after=%d", stats.BeforeChars, stats.AfterChars)
	}
}

func TestMaybeTransformSkipsJSON(t *testing.T) {
	t.Setenv("COSTGATE_CODE_MODE", "1")
	text := strings.Repeat(`{"dependencies":{}}`, 500)
	result := &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
	out, stats := MaybeTransform("get_file_contents", "package-lock.json", result)
	if stats.Applied {
		t.Fatal("json should skip code-mode")
	}
	if out.Content[0].(*mcp.TextContent).Text != text {
		t.Fatal("text should be unchanged")
	}
}

func TestMaybeTransformDisabled(t *testing.T) {
	t.Setenv("COSTGATE_CODE_MODE", "0")
	text := strings.Repeat("x", 5000)
	result := &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.TextContent{Text: text}},
	}
	out, stats := MaybeTransform("get_file_contents", "main.go", result)
	if stats.Applied {
		t.Fatal("disabled")
	}
	if out.Content[0].(*mcp.TextContent).Text != text {
		t.Fatal("unchanged")
	}
}

func TestPathFromArgs(t *testing.T) {
	raw := []byte(`{"owner":"o","repo":"r","path":"src/index.ts"}`)
	if got := PathFromArgs(raw); got != "src/index.ts" {
		t.Fatalf("path=%q", got)
	}
}
