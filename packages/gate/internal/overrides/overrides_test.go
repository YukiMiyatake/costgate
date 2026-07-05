package overrides

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
)

func TestApplyForceHidden(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tool-overrides.json")
	t.Setenv("COSTGATE_TOOL_OVERRIDES", path)

	f := &File{
		Version: 1,
		Tools: map[string]ToolOverride{
			"fork_repository": {ForceTier: "hidden"},
			"search_code":     {ForceTier: "A"},
		},
	}
	data, err := os.ReadFile(path)
	_ = data
	if err != nil {
		if !os.IsNotExist(err) {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(path, []byte(`{
  "version": 1,
  "tools": {
    "fork_repository": {"force_tier": "hidden"},
    "search_code": {"force_tier": "A"}
  }
}`), 0o644); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]filter.Tier{
		"fork_repository": filter.TierC,
		"search_code":     filter.TierB,
	}
	out := loaded.Apply(base)
	if out["fork_repository"] != filter.TierHidden {
		t.Fatalf("fork: got %v", out["fork_repository"])
	}
	if out["search_code"] != filter.TierA {
		t.Fatalf("search_code: got %v", out["search_code"])
	}
	_ = f
}
