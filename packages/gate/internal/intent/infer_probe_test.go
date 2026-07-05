package intent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
)

func TestResolveProbeLogKeywords(t *testing.T) {
	t.Setenv("COSTGATE_INTENT_DYNAMIC", "1")
	t.Setenv("COSTGATE_INTENT_PROBE", "1")
	t.Setenv("COSTGATE_INTENT_PROMPT", "0")

	dir := t.TempDir()
	path := filepath.Join(dir, "probe-2026-07-05.jsonl")
	now := time.Now().UTC().Format(time.RFC3339)
	if err := os.WriteFile(path, []byte(`{"type":"tool_call","tool":"merge_pull_request","ts":"`+now+`"}`+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("COSTGATE_PROBE_LOG_DIR", dir)

	got := Resolve(&usage.Store{Tools: map[string]usage.ToolStats{}}, "")
	if !strings.Contains(got, "merge") {
		t.Fatalf("expected probe keywords in %q", got)
	}
}
