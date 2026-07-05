package usage

import (
	"os"
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

func TestSaveDebouncedAndFlush(t *testing.T) {
	t.Setenv("COSTGATE_USAGE_SAVE_DEBOUNCE_MS", "50")

	dir := t.TempDir()
	path := dir + "/usage.json"
	store := &Store{path: path, Tools: map[string]ToolStats{}}
	store.Record("echo")
	store.SaveDebounced()

	if _, err := os.ReadFile(path); err == nil {
		t.Fatal("expected no file before debounce or flush")
	}

	if err := store.Flush(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "echo") {
		t.Fatalf("usage not saved: %s", data)
	}
}

func TestSaveDebouncedWritesAfterDelay(t *testing.T) {
	t.Setenv("COSTGATE_USAGE_SAVE_DEBOUNCE_MS", "30")

	dir := t.TempDir()
	path := dir + "/usage.json"
	store := &Store{path: path, Tools: map[string]ToolStats{}}
	store.Record("list_issues")
	store.SaveDebounced()

	time.Sleep(80 * time.Millisecond)

	if _, err := os.ReadFile(path); err != nil {
		t.Fatal("expected debounced save to write file")
	}
}
