package catalog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestLoadFromSession(t *testing.T) {
	server := mcp.NewServer(&mcp.Implementation{Name: "catalog-mock", Version: "1.0.0"}, nil)
	server.AddTool(&mcp.Tool{
		Name:        "search_issues",
		Description: "Search GitHub issues",
		InputSchema: map[string]any{"type": "object"},
	}, func(_ context.Context, _ *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return &mcp.CallToolResult{}, nil
	})
	server.AddTool(&mcp.Tool{
		Name:        "create_issue",
		Description: "Create issue",
		InputSchema: map[string]any{"type": "object"},
	}, func(_ context.Context, _ *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return &mcp.CallToolResult{}, nil
	})

	handler := mcp.NewStreamableHTTPHandler(func(_ *http.Request) *mcp.Server {
		return server
	}, &mcp.StreamableHTTPOptions{JSONResponse: true})
	httpServer := httptest.NewServer(handler)
	defer httpServer.Close()

	transport := &mcp.StreamableClientTransport{Endpoint: httpServer.URL}
	client := mcp.NewClient(&mcp.Implementation{Name: "catalog-test", Version: "1.0.0"}, nil)
	session, err := client.Connect(context.Background(), transport, nil)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer session.Close()

	cat, err := Load(context.Background(), session, "github")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cat.Backend != "github" {
		t.Fatalf("backend=%q", cat.Backend)
	}
	if len(cat.Tools) != 2 {
		t.Fatalf("tools=%d", len(cat.Tools))
	}
	tool, ok := cat.Get("search_issues")
	if !ok || tool.Description != "Search GitHub issues" {
		t.Fatalf("Get search_issues: ok=%v tool=%+v", ok, tool)
	}
}

func TestSearchAndGet(t *testing.T) {
	cat := &Catalog{
		Backend: "mock",
		Tools: []*mcp.Tool{
			{Name: "search_issues", Description: "Find issues"},
			{Name: "create_pull_request", Description: "Open PR"},
			{Name: "fork_repository", Description: "Fork repo"},
		},
		byName: map[string]*mcp.Tool{
			"search_issues":         {Name: "search_issues", Description: "Find issues"},
			"create_pull_request":   {Name: "create_pull_request", Description: "Open PR"},
			"fork_repository":       {Name: "fork_repository", Description: "Fork repo"},
		},
	}

	matches := cat.Search("issue", 5)
	if len(matches) != 1 || matches[0].Name != "search_issues" {
		t.Fatalf("Search issue: %+v", matches)
	}

	_, ok := cat.Get("fork_repository")
	if !ok {
		t.Fatal("Get fork_repository")
	}
	_, ok = cat.Get("missing")
	if ok {
		t.Fatal("Get missing should fail")
	}
}
