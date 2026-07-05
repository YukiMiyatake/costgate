package shield

import (
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/env"
)

const defaultVaultTTL = 24 * time.Hour

// Enabled reports whether Gate Shield redact/unredact is active.
func Enabled() bool {
	return env.Bool("COSTGATE_SHIELD", false)
}

// VaultDir returns the vault storage directory.
func VaultDir() string {
	if p := os.Getenv("COSTGATE_SHIELD_DIR"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".costgate/vault"
	}
	return filepath.Join(home, ".costgate", "vault")
}

// TrustPath returns the global MCP trust config path.
func TrustPath() string {
	if p := os.Getenv("COSTGATE_TRUST_PATH"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "mcp-trust.json"
	}
	return filepath.Join(home, ".costgate", "mcp-trust.json")
}

// ProjectTrustPath returns project-scoped trust config when COSTGATE_PROJECT_ROOT is set.
func ProjectTrustPath() string {
	root := os.Getenv("COSTGATE_PROJECT_ROOT")
	if root == "" {
		return ""
	}
	return filepath.Join(root, ".costgate", "mcp-trust.json")
}

// SessionID scopes vault entries to one agent session.
func SessionID() string {
	if s := os.Getenv("COSTGATE_SHIELD_SESSION"); s != "" {
		return s
	}
	if s := os.Getenv("COSTGATE_CLIENT"); s != "" {
		return s
	}
	return "default"
}

// VaultTTL returns how long vault entries remain valid.
func VaultTTL() time.Duration {
	v := os.Getenv("COSTGATE_SHIELD_VAULT_TTL_SEC")
	if v == "" {
		return defaultVaultTTL
	}
	sec, err := strconv.Atoi(v)
	if err != nil || sec <= 0 {
		return defaultVaultTTL
	}
	return time.Duration(sec) * time.Second
}
