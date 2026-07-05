package usage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRecentProbeLogKeywords(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "probe-2026-07-05.jsonl")
	now := time.Now().UTC().Format(time.RFC3339)
	content := `{"type":"tool_call","tool":"merge_pull_request","ts":"` + now + `"}` + "\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	got := RecentProbeLogKeywords(dir, 3, 30*time.Minute)
	if got == "" {
		t.Fatal("expected keywords from probe log")
	}
	if !strings.Contains(got, "merge") || !strings.Contains(got, "pull") {
		t.Fatalf("expected merge/pull in %q", got)
	}
}
