package catalog

import (
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestQualifyName(t *testing.T) {
	if got := QualifyName("github", "get_file_contents"); got != "github/get_file_contents" {
		t.Errorf("QualifyName = %q", got)
	}
}

func TestSplitQualified(t *testing.T) {
	tests := []struct {
		name        string
		in          string
		wantBackend string
		wantTool    string
		wantOK      bool
	}{
		{"valid", "github/get_file_contents", "github", "get_file_contents", true},
		{"serena", "serena/search_symbols", "serena", "search_symbols", true},
		{"no slash", "echo", "", "", false},
		{"empty backend", "/tool", "", "", false},
		{"empty tool", "github/", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			backend, tool, ok := SplitQualified(tt.in)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if backend != tt.wantBackend || tool != tt.wantTool {
				t.Errorf("got (%q, %q), want (%q, %q)", backend, tool, tt.wantBackend, tt.wantTool)
			}
		})
	}
}

func TestQualifyTool(t *testing.T) {
	orig := &mcp.Tool{Name: "echo", Description: "test"}
	qualified := QualifyTool("mock", orig)
	if qualified.Name != "mock/echo" {
		t.Errorf("name = %q", qualified.Name)
	}
	if qualified.Description != "test" {
		t.Error("description not preserved")
	}
	if orig.Name != "echo" {
		t.Error("original tool mutated")
	}
}
