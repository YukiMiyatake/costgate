package shield

import (
	"encoding/json"
	"os"
)

const trustVersion = 1

var trustLevels = map[string]Mode{
	"trusted":    ModeOff,
	"standard":   ModeSecrets,
	"restricted": ModeAggressive,
	"untrusted":  ModeFull,
}

type trustDefaults struct {
	GateBackend string `json:"gate_backend"`
	DirectMCP   string `json:"direct_mcp"`
	Unknown     string `json:"unknown"`
}

type trustServerEntry struct {
	Trust      string `json:"trust"`
	Source     string `json:"source,omitempty"`
	BackendKey string `json:"backend_key,omitempty"`
}

type trustConfig struct {
	Version  int                         `json:"version"`
	Defaults trustDefaults               `json:"defaults"`
	Servers  map[string]trustServerEntry `json:"servers"`
}

func defaultTrustConfig() trustConfig {
	return trustConfig{
		Version: trustVersion,
		Defaults: trustDefaults{
			GateBackend: "standard",
			DirectMCP:   "restricted",
			Unknown:     "restricted",
		},
		Servers: map[string]trustServerEntry{
			"costgate-gate":  {Trust: "trusted", Source: "builtin"},
			"costgate-probe": {Trust: "trusted", Source: "builtin"},
		},
	}
}

func loadTrustFile(path string) (trustConfig, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return trustConfig{}, false
	}
	var raw trustConfig
	if err := json.Unmarshal(data, &raw); err != nil {
		return trustConfig{}, false
	}
	return normalizeTrustConfig(raw), true
}

func normalizeTrustConfig(raw trustConfig) trustConfig {
	out := defaultTrustConfig()
	if raw.Defaults.GateBackend != "" && validTrustLevel(raw.Defaults.GateBackend) {
		out.Defaults.GateBackend = raw.Defaults.GateBackend
	}
	if raw.Defaults.DirectMCP != "" && validTrustLevel(raw.Defaults.DirectMCP) {
		out.Defaults.DirectMCP = raw.Defaults.DirectMCP
	}
	if raw.Defaults.Unknown != "" && validTrustLevel(raw.Defaults.Unknown) {
		out.Defaults.Unknown = raw.Defaults.Unknown
	}
	for name, entry := range raw.Servers {
		if validTrustLevel(entry.Trust) {
			out.Servers[name] = entry
		}
	}
	return out
}

func validTrustLevel(level string) bool {
	_, ok := trustLevels[level]
	return ok
}

func mergeTrustConfigs(global, project trustConfig) trustConfig {
	out := global
	if project.Defaults.GateBackend != "" {
		out.Defaults.GateBackend = project.Defaults.GateBackend
	}
	if project.Defaults.DirectMCP != "" {
		out.Defaults.DirectMCP = project.Defaults.DirectMCP
	}
	if project.Defaults.Unknown != "" {
		out.Defaults.Unknown = project.Defaults.Unknown
	}
	for name, entry := range project.Servers {
		out.Servers[name] = entry
	}
	return out
}

// LoadTrust reads global + optional project trust config.
func LoadTrust() trustConfig {
	cfg := defaultTrustConfig()
	if loaded, ok := loadTrustFile(TrustPath()); ok {
		cfg = loaded
	}
	if projectPath := ProjectTrustPath(); projectPath != "" {
		if project, ok := loadTrustFile(projectPath); ok {
			cfg = mergeTrustConfigs(cfg, project)
		}
	}
	return cfg
}

// ModeForBackend resolves redact mode for a Gate backend name (e.g. github, mock).
func ModeForBackend(backendName string) Mode {
	cfg := LoadTrust()
	if entry, ok := cfg.Servers[backendName]; ok {
		if mode, ok := trustLevels[entry.Trust]; ok {
			return mode
		}
	}
	// Gate backends use gate_backend default.
	if mode, ok := trustLevels[cfg.Defaults.GateBackend]; ok {
		return mode
	}
	return ModeSecrets
}

// DenyCalls reports whether tools/call should be blocked for this backend trust.
func DenyCalls(backendName string) bool {
	cfg := LoadTrust()
	level := resolveTrustLevel(cfg, backendName)
	return level == "untrusted"
}

func resolveTrustLevel(cfg trustConfig, backendName string) string {
	if entry, ok := cfg.Servers[backendName]; ok {
		return entry.Trust
	}
	return cfg.Defaults.GateBackend
}

// TrustLabel returns the resolved trust level string for logging.
func TrustLabel(backendName string) string {
	return resolveTrustLevel(LoadTrust(), backendName)
}

// ModeLabel returns a human-readable mode name.
func ModeLabel(mode Mode) string {
	switch mode {
	case ModeOff:
		return "off"
	case ModeSecrets:
		return "secrets"
	case ModeAggressive:
		return "aggressive"
	case ModeFull:
		return "full"
	default:
		return "unknown"
	}
}

// IsOfficialMarketplace is a stub for Phase 31e; official templates default to standard.
func IsOfficialMarketplace(_ string) bool {
	return false
}
