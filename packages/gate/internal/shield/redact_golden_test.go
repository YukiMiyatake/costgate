package shield

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type goldenCase struct {
	ID             string   `json:"id"`
	Input          string   `json:"input"`
	Mode           string   `json:"mode"`
	MustNotContain []string `json:"must_not_contain"`
	MustContain    []string `json:"must_contain"`
	MustPreserve   []string `json:"must_preserve"`
}

type goldenFixture struct {
	Cases []goldenCase `json:"cases"`
}

func parseGoldenMode(name string) Mode {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "full":
		return ModeFull
	case "aggressive":
		return ModeAggressive
	default:
		return ModeSecrets
	}
}

func TestRedactGoldenFixture(t *testing.T) {
	path := os.Getenv("COSTGATE_REDACT_GOLDEN_FIXTURE")
	if path == "" {
		path = filepath.Join("..", "..", "..", "test", "fixtures", "shield-redact-golden.json")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("golden fixture not found: %v", err)
	}
	var fixture goldenFixture
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}

	dir := t.TempDir()
	t.Setenv("COSTGATE_SHIELD", "1")
	t.Setenv("COSTGATE_SHIELD_DIR", dir)
	t.Setenv("COSTGATE_SHIELD_SESSION", "golden-go")

	vault, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}

	for _, c := range fixture.Cases {
		mode := parseGoldenMode(c.Mode)
		out := redactString(c.Input, mode, vault)
		if strings.TrimSpace(c.Input) != "" && strings.HasPrefix(strings.TrimSpace(c.Input), "{") {
			out = redactText(c.Input, mode, vault)
		}
		for _, needle := range c.MustNotContain {
			if strings.Contains(out, needle) {
				t.Fatalf("%s: leaked %q in %q", c.ID, needle, out)
			}
		}
		for _, needle := range c.MustContain {
			if !strings.Contains(out, needle) {
				t.Fatalf("%s: missing %q in %q", c.ID, needle, out)
			}
		}
		for _, needle := range c.MustPreserve {
			if !strings.Contains(out, needle) {
				t.Fatalf("%s: lost %q in %q", c.ID, needle, out)
			}
		}
	}
}
