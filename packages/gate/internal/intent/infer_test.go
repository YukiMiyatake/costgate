package intent

import (
	"strings"
	"testing"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
)

func TestResolveStaticOnlyWhenDynamicDisabled(t *testing.T) {
	t.Setenv("COSTGATE_INTENT_DYNAMIC", "0")
	t.Setenv("COSTGATE_INTENT_PROMPT", "0")
	store := &usage.Store{
		Tools: map[string]usage.ToolStats{
			"merge_pull_request": {CallCount: 3, LastUsed: time.Now().UTC()},
		},
	}
	got := Resolve(store, "issue")
	if got != "issue" {
		t.Fatalf("got %q, want static only", got)
	}
}

func TestResolveMergesRecentUsage(t *testing.T) {
	t.Setenv("COSTGATE_INTENT_DYNAMIC", "1")
	t.Setenv("COSTGATE_INTENT_PROMPT", "0")
	t.Setenv("COSTGATE_INTENT_PROBE", "0")
	store := &usage.Store{
		Tools: map[string]usage.ToolStats{
			"merge_pull_request": {CallCount: 1, LastUsed: time.Now().UTC()},
		},
	}
	got := Resolve(store, "")
	if !strings.Contains(got, "merge") || !strings.Contains(got, "pull") {
		t.Fatalf("expected recent keywords in %q", got)
	}
}
