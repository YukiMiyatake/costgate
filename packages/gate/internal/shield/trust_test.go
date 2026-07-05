package shield

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func writeTrust(t *testing.T, servers map[string]trustServerEntry) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "mcp-trust.json")
	cfg := defaultTrustConfig()
	for k, v := range servers {
		cfg.Servers[k] = v
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestModeForBackendFromConfig(t *testing.T) {
	path := writeTrust(t, map[string]trustServerEntry{
		"mock": {Trust: "restricted"},
	})
	t.Setenv("COSTGATE_TRUST_PATH", path)

	if got := ModeForBackend("mock"); got != ModeAggressive {
		t.Fatalf("mock restricted → aggressive, got %v", got)
	}
	if got := ModeForBackend("unknown-backend"); got != ModeSecrets {
		t.Fatalf("default gate_backend=standard → secrets, got %v", got)
	}
}

func TestDenyCallsUntrusted(t *testing.T) {
	path := writeTrust(t, map[string]trustServerEntry{
		"evil": {Trust: "untrusted"},
	})
	t.Setenv("COSTGATE_TRUST_PATH", path)

	if !DenyCalls("evil") {
		t.Fatal("untrusted backend should deny calls")
	}
	if DenyCalls("mock") {
		t.Fatal("default backend should not deny")
	}
}

func TestTrustedBackendNoRedact(t *testing.T) {
	path := writeTrust(t, map[string]trustServerEntry{
		"mock": {Trust: "trusted"},
	})
	t.Setenv("COSTGATE_TRUST_PATH", path)

	if got := ModeForBackend("mock"); got != ModeOff {
		t.Fatalf("trusted → off, got %v", got)
	}
}
