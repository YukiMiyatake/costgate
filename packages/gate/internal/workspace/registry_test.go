package workspace

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTouchCreatesAndUpdates(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "workspace-registry.json")
	project := filepath.Join(dir, "proj")
	if err := os.MkdirAll(filepath.Join(project, ".costgate"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(project, ".costgate", "backends.json"), []byte(`{"backends":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := Touch(project, regPath); err != nil {
		t.Fatal(err)
	}
	reg, err := Load(regPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.Workspaces) != 1 {
		t.Fatalf("expected 1 workspace, got %d", len(reg.Workspaces))
	}
	if !reg.Workspaces[0].HasConfig {
		t.Error("expected has_config true")
	}
	first := reg.Workspaces[0].LastSeen

	time.Sleep(5 * time.Millisecond)
	if err := Touch(project, regPath); err != nil {
		t.Fatal(err)
	}
	reg2, _ := Load(regPath)
	if len(reg2.Workspaces) != 1 {
		t.Fatalf("expected still 1 workspace, got %d", len(reg2.Workspaces))
	}
	if !reg2.Workspaces[0].LastSeen.After(first) {
		t.Error("last_seen should advance")
	}
}

func TestRegisterFromEnvSkipsEmpty(t *testing.T) {
	t.Setenv("COSTGATE_PROJECT_ROOT", "")
	RegisterFromEnv() // no panic
}

func TestLoadMissing(t *testing.T) {
	reg, err := Load(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatal(err)
	}
	if reg.Version != 1 || len(reg.Workspaces) != 0 {
		t.Fatalf("unexpected: %+v", reg)
	}
}

func TestSaveRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "r.json")
	reg := &Registry{
		Version: 1,
		Workspaces: []Entry{{
			Path:     "/tmp/x",
			Label:    "x",
			LastSeen: time.Now().UTC(),
			Pinned:   true,
		}},
	}
	if err := Save(reg, path); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatal(err)
	}
}
