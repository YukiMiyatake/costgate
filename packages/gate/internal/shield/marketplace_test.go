package shield

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func resetMarketplaceCacheForTest() {
	marketplaceMu.Lock()
	marketplaceLoaded = false
	officialByKey = nil
	marketplaceMu.Unlock()
}

func writeMarketplaceTemplate(t *testing.T, dir, name string, id, backendKey string, official bool) {
	t.Helper()
	payload := map[string]any{
		"id":          id,
		"backend_key": backendKey,
		"official":    official,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestIsOfficialMarketplace(t *testing.T) {
	resetMarketplaceCacheForTest()
	dir := t.TempDir()
	writeMarketplaceTemplate(t, dir, "github.json", "github", "github", true)
	writeMarketplaceTemplate(t, dir, "slack.json", "slack", "slack", false)
	t.Setenv("COSTGATE_MARKETPLACE_DIR", dir)

	if !IsOfficialMarketplace("github") {
		t.Fatal("github should be official")
	}
	if IsOfficialMarketplace("slack") {
		t.Fatal("slack should not be official")
	}
	if IsOfficialMarketplace("unknown") {
		t.Fatal("unknown should not be official")
	}
}

func TestModeForBackendOfficialMarketplace(t *testing.T) {
	resetMarketplaceCacheForTest()
	dir := t.TempDir()
	writeMarketplaceTemplate(t, dir, "github.json", "github", "github", true)
	t.Setenv("COSTGATE_MARKETPLACE_DIR", dir)

	path := writeTrust(t, map[string]trustServerEntry{})
	t.Setenv("COSTGATE_TRUST_PATH", path)

	if got := ModeForBackend("github"); got != ModeSecrets {
		t.Fatalf("official marketplace default → secrets, got %v", got)
	}
	if got := TrustLabel("github"); got != "standard" {
		t.Fatalf("official marketplace trust label, got %q", got)
	}
}
