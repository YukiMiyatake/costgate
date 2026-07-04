package usage

import (
	"strings"
	"testing"
	"time"
)

func TestRecentKeywords(t *testing.T) {
	now := time.Now().UTC()
	store := &Store{
		Tools: map[string]ToolStats{
			"merge_pull_request": {CallCount: 2, LastUsed: now},
			"list_issues":        {CallCount: 1, LastUsed: now.Add(-time.Hour)},
		},
	}
	got := store.RecentKeywords(3, time.Hour)
	if got == "" {
		t.Fatal("expected keywords")
	}
	words := strings.Fields(got)
	has := map[string]bool{}
	for _, w := range words {
		has[w] = true
	}
	if !has["merge"] || !has["pull"] {
		t.Fatalf("unexpected keywords: %q", got)
	}
}
