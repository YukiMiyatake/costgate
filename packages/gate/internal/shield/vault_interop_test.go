package shield

import (
	"os"
	"strings"
	"testing"
)

// TestVaultJSInterop verifies a vault file written by scripts/lib/shield-vault.mjs
// can be read by the Go Vault (shared COSTGATE_SHIELD_SESSION + dir).
func TestVaultJSInterop(t *testing.T) {
	dir := os.Getenv("COSTGATE_SHIELD_DIR")
	session := os.Getenv("COSTGATE_SHIELD_SESSION")
	lookupID := os.Getenv("COSTGATE_VAULT_LOOKUP_ID")
	expected := os.Getenv("COSTGATE_VAULT_EXPECTED_VALUE")
	if dir == "" || session == "" || lookupID == "" || expected == "" {
		t.Skip("JS interop env not set")
	}

	v, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}
	if v.sessionID != session {
		t.Fatalf("session mismatch: got %q want %q", v.sessionID, session)
	}
	val, ok := v.Lookup(lookupID)
	if !ok {
		t.Fatalf("lookup %q failed in %s", lookupID, v.filePath())
	}
	if val != expected {
		t.Fatalf("value mismatch: got %q want %q", val, expected)
	}
}

// TestVaultGoToJSFormat ensures Go-written vault matches JS-readable JSON shape.
func TestVaultGoToJSFormat(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("COSTGATE_SHIELD_DIR", dir)
	t.Setenv("COSTGATE_SHIELD_SESSION", "go-js-format")

	token := "ghp_abcdefghijklmnopqrstuvwxyz1234"
	v1, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}
	ph := v1.Store("GITHUB_PAT", token)
	id := strings.TrimSuffix(strings.TrimPrefix(ph, "[[CG:GITHUB_PAT:"), "]]")

	v2, err := NewVault()
	if err != nil {
		t.Fatal(err)
	}
	val, ok := v2.Lookup(id)
	if !ok || val != token {
		t.Fatalf("reload failed: ok=%v val=%q", ok, val)
	}

	data, err := os.ReadFile(v2.filePath())
	if err != nil {
		t.Fatal(err)
	}
	body := string(data)
	if !strings.Contains(body, `"entries"`) || !strings.Contains(body, token) {
		t.Fatalf("unexpected vault JSON: %s", body)
	}
}
