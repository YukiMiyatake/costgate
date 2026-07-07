package gatesettings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadProjectOverridesGlobal(t *testing.T) {
	dir := t.TempDir()
	global := filepath.Join(dir, "global.json")
	projectDir := filepath.Join(dir, "project")
	project := filepath.Join(projectDir, ".costgate", "gate-settings.json")
	if err := os.MkdirAll(filepath.Dir(project), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("COSTGATE_GATE_SETTINGS_PATH", global)
	t.Setenv("COSTGATE_PROJECT_ROOT", projectDir)

	if err := os.WriteFile(global, []byte(`{
  "version": 1,
  "compress": true,
  "static_intent": "global"
}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(project, []byte(`{
  "version": 1,
  "static_intent": "project"
}`), 0o644); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.StaticIntent != "project" {
		t.Fatalf("project override: got %q", loaded.StaticIntent)
	}
	if !loaded.Compress {
		t.Fatal("expected compress from global")
	}
}

func TestApplyToEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "gate-settings.json")
	t.Setenv("COSTGATE_GATE_SETTINGS_PATH", path)
	if err := os.WriteFile(path, []byte(`{
  "version": 1,
  "exposure_mode": "aggressive",
  "exposure_max_b": 3,
  "slim_list": true,
  "static_intent": "merge pull"
}`), 0o644); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	loaded.ApplyToEnv()
	if os.Getenv("COSTGATE_EXPOSURE_MODE") != "aggressive" {
		t.Fatalf("exposure mode: %q", os.Getenv("COSTGATE_EXPOSURE_MODE"))
	}
	if os.Getenv("COSTGATE_EXPOSURE_MAX_B") != "3" {
		t.Fatalf("exposure max b: %q", os.Getenv("COSTGATE_EXPOSURE_MAX_B"))
	}
	if os.Getenv("COSTGATE_SLIM_LIST") != "1" {
		t.Fatalf("slim list: %q", os.Getenv("COSTGATE_SLIM_LIST"))
	}
	if os.Getenv("COSTGATE_INTENT") != "merge pull" {
		t.Fatalf("intent: %q", os.Getenv("COSTGATE_INTENT"))
	}
}

func TestGenerationStable(t *testing.T) {
	s := defaultSettings()
	s.StaticIntent = "github"
	g1 := s.Generation()
	g2 := s.Generation()
	if g1 == "" || g1 != g2 {
		t.Fatalf("generation unstable: %q %q", g1, g2)
	}
}
