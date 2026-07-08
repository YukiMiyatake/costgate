package filter

import (
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestSelectExposedPermissive(t *testing.T) {
	t.Setenv("COSTGATE_EXPOSURE_MODE", "permissive")

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
	exposed := SelectExposed(tools, tiers, "")
	names := map[string]bool{}
	for _, tool := range exposed {
		names[tool.Name] = true
	}
	if !names["search_repositories"] || !names["list_pull_requests"] {
		t.Fatalf("permissive should expose A+B without intent: %v", names)
	}
	if names["fork_repository"] {
		t.Fatal("tier C should stay hidden without intent in permissive mode")
	}

	exposedWithIntent := SelectExposed(tools, tiers, "fork")
	names = map[string]bool{}
	for _, tool := range exposedWithIntent {
		names[tool.Name] = true
	}
	if !names["fork_repository"] {
		t.Fatal("tier C should expose when intent matches in permissive mode")
	}
}

func TestSelectExposedAggressiveCapsTierB(t *testing.T) {
	t.Setenv("COSTGATE_EXPOSURE_MODE", "aggressive")
	t.Setenv("COSTGATE_EXPOSURE_MAX_B", "1")

	tools := []*mcp.Tool{
		{Name: "search_repositories"},
		{Name: "list_pull_requests", Description: "List pull requests"},
		{Name: "merge_pull_request", Description: "Merge pull request"},
	}
	tiers := map[string]Tier{
		"search_repositories": TierA,
		"list_pull_requests":  TierB,
		"merge_pull_request":  TierB,
	}

	exposed := SelectExposed(tools, tiers, "merge pull request")
	names := map[string]bool{}
	for _, tool := range exposed {
		names[tool.Name] = true
	}
	if !names["search_repositories"] {
		t.Fatal("tier A must stay exposed")
	}
	if names["list_pull_requests"] {
		t.Fatal("lower relevance Tier B should be capped out")
	}
	if !names["merge_pull_request"] {
		t.Fatal("top relevance Tier B should remain")
	}
}

func TestSelectExposedBudgetLimitsTokens(t *testing.T) {
	t.Setenv("COSTGATE_EXPOSURE_MODE", "budget")
	t.Setenv("COSTGATE_EXPOSURE_TOKEN_BUDGET", "60")

	small := &mcp.Tool{Name: "list_pull_requests", Description: "List pull requests"}
	big := &mcp.Tool{
		Name:        "merge_pull_request",
		Description: "Merge pull request",
		InputSchema: map[string]any{"type": "object", "properties": map[string]any{
			"body": map[string]any{"type": "string", "description": string(make([]byte, 500))},
		}},
	}
	tools := []*mcp.Tool{small, big}
	tiers := map[string]Tier{
		"list_pull_requests":  TierB,
		"merge_pull_request": TierB,
	}

	exposed := SelectExposed(tools, tiers, "pull request")
	if len(exposed) != 1 || exposed[0].Name != "list_pull_requests" {
		names := []string{}
		for _, tool := range exposed {
			names = append(names, tool.Name)
		}
		t.Fatalf("budget should keep smaller matching tool, got %v", names)
	}
}

func TestIntentRelevanceScore(t *testing.T) {
	tool := &mcp.Tool{Name: "merge_pull_request", Description: "Merge a pull request"}
	if IntentRelevanceScore("merge pull", tool) <= IntentRelevanceScore("pull request", &mcp.Tool{
		Name: "list_issues", Description: "pull request list",
	}) {
		t.Fatal("name match should outrank description-only match")
	}
}
