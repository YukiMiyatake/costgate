package usage

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestRecentPromptIntentKeywords(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "latest.json")

	fresh := time.Now().UnixMilli()
	body := `{"keywords":"github pull merge issue","ts":` + strconv.FormatInt(fresh, 10) + `}`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	got := RecentPromptIntentKeywords(dir, time.Hour)
	if got != "github pull merge issue" {
		t.Fatalf("got %q", got)
	}

	stale := fresh - int64(2*time.Hour/time.Millisecond)
	staleBody := `{"keywords":"old","ts":` + strconv.FormatInt(stale, 10) + `}`
	if err := os.WriteFile(path, []byte(staleBody), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := RecentPromptIntentKeywords(dir, time.Hour); got != "" {
		t.Fatalf("expected stale ignored, got %q", got)
	}
}
