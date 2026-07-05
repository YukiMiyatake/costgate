package intent

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
)

func TestResolveMergesPromptIntent(t *testing.T) {
	t.Setenv("COSTGATE_INTENT_DYNAMIC", "1")
	t.Setenv("COSTGATE_INTENT_PROBE", "0")
	t.Setenv("COSTGATE_INTENT_PROMPT", "1")

	dir := t.TempDir()
	t.Setenv("COSTGATE_PROMPT_INTENT_DIR", dir)

	fresh := time.Now().UnixMilli()
	body := `{"keywords":"github pull merge","ts":` + strconv.FormatInt(fresh, 10) + `}`
	if err := os.WriteFile(filepath.Join(dir, "latest.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	got := Resolve(&usage.Store{Tools: map[string]usage.ToolStats{}}, "")
	if !strings.Contains(got, "github") || !strings.Contains(got, "merge") {
		t.Fatalf("expected prompt keywords in %q", got)
	}
}
