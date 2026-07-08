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
	_ = f
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
}

func TestApplyInPlace(t *testing.T) {
	base := map[string]filter.Tier{
		"a": filter.TierB,
		"b": filter.TierC,
		"c": filter.TierA,
	}
	dest := filter.CopyTiers(base)
	f := &File{
		Version: 1,
		Tools: map[string]ToolOverride{
			"a": {ForceTier: "hidden"},
			"b": {AlwaysExpose: true},
		},
	}
	f.ApplyInPlace(base, dest)
	if dest["a"] != filter.TierHidden {
		t.Fatalf("a: got %v", dest["a"])
	}
	if dest["b"] != filter.TierA {
		t.Fatalf("b: got %v", dest["b"])
	}
	if dest["c"] != filter.TierA {
		t.Fatalf("c unchanged: got %v", dest["c"])
	}
}

func TestApplyForceHiddenQualifiedMultiBackend(t *testing.T) {
	base := map[string]filter.Tier{
		"github/search_code": filter.TierA,
		"serena/find_symbol": filter.TierB,
	}
	f := &File{
		Version: 1,
		Tools: map[string]ToolOverride{
			"search_code": {ForceTier: "hidden"},
		},
	}
	out := f.Apply(base)
	if out["github/search_code"] != filter.TierHidden {
		t.Fatalf("unqualified hidden: got %v", out["github/search_code"])
	}
	if out["serena/find_symbol"] != filter.TierB {
		t.Fatalf("other backend unchanged: got %v", out["serena/find_symbol"])
	}
}

	dir := t.TempDir()
	path := filepath.Join(dir, "tool-overrides.json")
	t.Setenv("COSTGATE_TOOL_OVERRIDES", path)
	if err := os.WriteFile(path, []byte(`{
  "version": 1,
  "tools": {
    "find_symbol": {"always_expose": true}
  }
}`), 0o644); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]filter.Tier{
		"find_symbol": filter.TierC,
	}
	out := loaded.Apply(base)
	if out["find_symbol"] != filter.TierA {
		t.Fatalf("always_expose: got %v", out["find_symbol"])
	}
}
