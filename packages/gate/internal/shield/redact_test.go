package shield

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestRedactGitHubToken(t *testing.T) {
	t.Setenv("COSTGATE_SHIELD", "1")
	t.Setenv("COSTGATE_SHIELD_DIR", t.TempDir())

	vault, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}
	token := "ghp_1234567890abcdefghijklmnopqrst"
	input := "Authorization: " + token
	out := redactString(input, ModeSecrets, vault)

	if strings.Contains(out, token) {
		t.Fatalf("token leaked in output: %q", out)
	}
	if !strings.Contains(out, "[[CG:GITHUB_PAT:") {
		t.Fatalf("expected placeholder, got %q", out)
	}
}

func TestRedactJSONSensitiveField(t *testing.T) {
	t.Setenv("COSTGATE_SHIELD", "1")
	t.Setenv("COSTGATE_SHIELD_DIR", t.TempDir())

	vault, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}
	raw := map[string]any{
		"api_key": "sk-secret-value-12345",
		"name":    "public",
	}
	out := redactValue(raw, ModeSecrets, vault).(map[string]any)
	keyVal, ok := out["api_key"].(string)
	if !ok {
		t.Fatal("api_key not string")
	}
	if strings.Contains(keyVal, "sk-secret") {
		t.Fatalf("secret not redacted: %q", keyVal)
	}
	if !strings.HasPrefix(keyVal, "[[CG:") {
		t.Fatalf("expected placeholder, got %q", keyVal)
	}
	if out["name"] != "public" {
		t.Fatalf("public field changed: %v", out["name"])
	}
}

func TestUnredactRoundTrip(t *testing.T) {
	t.Setenv("COSTGATE_SHIELD", "1")
	t.Setenv("COSTGATE_SHIELD_DIR", t.TempDir())

	h, err := NewHandler()
	if err != nil {
		t.Fatal(err)
	}
	token := "ghp_abcdefghijklmnopqrstuvwxyz1234"
	redacted := redactString(token, ModeSecrets, h.vault)
	restored := unredactString(redacted, h.vault)
	if restored != token {
		t.Fatalf("round trip failed: %q → %q → %q", token, redacted, restored)
	}
}

func TestModeFullRedactsStrings(t *testing.T) {
	t.Setenv("COSTGATE_SHIELD", "1")
	t.Setenv("COSTGATE_SHIELD_DIR", t.TempDir())

	vault, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}
	out := redactString("hello world secret data", ModeFull, vault)
	if strings.Contains(out, "secret data") {
		t.Fatalf("full mode should redact: %q", out)
	}
	if !strings.Contains(out, "[[CG:REDACTED:") {
		t.Fatalf("expected REDACTED placeholder: %q", out)
	}
}

func TestVaultPersistsEntries(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("COSTGATE_SHIELD_DIR", dir)
	t.Setenv("COSTGATE_SHIELD_SESSION", "test-session")

	v1, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}
	ph := v1.Store("GITHUB_PAT", "ghp_testtoken123456789012345678")
	id := strings.TrimSuffix(strings.TrimPrefix(ph, "[[CG:GITHUB_PAT:"), "]]")

	v2, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}
	val, ok := v2.Lookup(id)
	if !ok || val != "ghp_testtoken123456789012345678" {
		t.Fatalf("vault reload failed: ok=%v val=%q", ok, val)
	}
	if _, err := filepath.Abs(dir); err != nil {
		t.Fatal(err)
	}
}

func TestLuhnValid(t *testing.T) {
	if !LuhnValid("4111111111111111") {
		t.Fatal("valid visa should pass Luhn")
	}
	if LuhnValid("4111111111111112") {
		t.Fatal("invalid number should fail Luhn")
	}
}
