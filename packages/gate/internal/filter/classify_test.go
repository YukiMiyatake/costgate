package filter

import (
	"testing"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestClassifyBootstrap(t *testing.T) {
	tools := []*mcp.Tool{
		{Name: "search_repositories"},
		{Name: "get_file_contents"},
		{Name: "fork_repository"},
		{Name: "merge_pull_request"},
		{Name: "add_issue_comment"},
	}
	store := &usage.Store{Tools: map[string]usage.ToolStats{}}
	tiers := Classify(tools, store)

	if tiers["search_repositories"] != TierA {
		t.Fatalf("search_repositories: got %s, want A", tiers["search_repositories"])
	}
	if tiers["get_file_contents"] != TierA {
		t.Fatalf("get_file_contents: got %s, want A", tiers["get_file_contents"])
	}
	a, b, c := CountTiers(tiers)
	if a+b+c != len(tools) {
		t.Fatalf("tier count mismatch: %d %d %d", a, b, c)
	}
}

func TestMatchIntent(t *testing.T) {
	tool := &mcp.Tool{Name: "list_pull_requests", Description: "List pull requests for a repository"}
	if !MatchIntent("show pull requests", tool) {
		t.Fatal("expected intent match")
	}
	if MatchIntent("browser screenshot", tool) {
		t.Fatal("expected no match")
	}
}

func TestSelectExposed(t *testing.T) {
	tools := []*mcp.Tool{
		{Name: "search_repositories"},
		{Name: "list_pull_requests"},
		{Name: "fork_repository"},
	}
	tiers := map[string]Tier{
		"search_repositories": TierA,
		"list_pull_requests":  TierB,
		"fork_repository":     TierC,
	}
	exposed := SelectExposed(tools, tiers, "pull request")
	names := map[string]bool{}
	for _, tool := range exposed {
		names[tool.Name] = true
	}
	if !names["search_repositories"] || !names["list_pull_requests"] {
		t.Fatalf("unexpected exposed set: %v", names)
	}
	if names["fork_repository"] {
		t.Fatal("tier C tool should not be exposed")
	}
}
