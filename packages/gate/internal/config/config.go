package config

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// BackendConfig describes a downstream MCP server (stdio process or HTTP URL).
type BackendConfig struct {
	Always  bool              `json:"always,omitempty"`
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Cwd     string            `json:"cwd,omitempty"`
}

// Validate checks that the backend has exactly one transport configured.
func (c BackendConfig) Validate() error {
	hasURL := strings.TrimSpace(c.URL) != ""
	hasCmd := strings.TrimSpace(c.Command) != ""
	if hasURL && hasCmd {
		return fmt.Errorf("backend must not set both url and command")
	}
	if !hasURL && !hasCmd {
		return fmt.Errorf("backend requires url or command")
	}
	if hasURL {
		u, err := url.Parse(c.URL)
		if err != nil {
			return fmt.Errorf("invalid backend url: %w", err)
		}
		if u.Scheme != "http" && u.Scheme != "https" {
			return fmt.Errorf("backend url must use http or https")
		}
		if u.Host == "" {
			return fmt.Errorf("backend url missing host")
		}
	}
	return nil
}

// GateConfig is the Probe-compatible backends file format.
type GateConfig struct {
	Backends map[string]BackendConfig `json:"backends"`
}

// ResolveConfigPath returns COSTGATE_CONFIG or ~/.costgate/backends.json.
func ResolveConfigPath() string {
	if p := os.Getenv("COSTGATE_CONFIG"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "backends.json"
	}
	return filepath.Join(home, ".costgate", "backends.json")
}

// Load reads and validates the gate backends configuration.
func Load() (GateConfig, error) {
	path := ResolveConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return GateConfig{}, fmt.Errorf("read config %s: %w\nCopy examples/backends.github.json to ~/.costgate/backends.json", path, err)
	}

	var cfg GateConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return GateConfig{}, fmt.Errorf("parse config %s: %w", path, err)
	}
	if len(cfg.Backends) == 0 {
		return GateConfig{}, fmt.Errorf("no backends in %s", path)
	}
	for name, backend := range cfg.Backends {
		if err := backend.Validate(); err != nil {
			return GateConfig{}, fmt.Errorf("backend %q: %w", name, err)
		}
	}
	return cfg, nil
}

// BackendNames returns sorted backend names from cfg.
func BackendNames(cfg GateConfig) []string {
	names := make([]string, 0, len(cfg.Backends))
	for name := range cfg.Backends {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// PrimaryBackend returns github if present, otherwise the first backend.
func PrimaryBackend(cfg GateConfig) (string, BackendConfig, error) {
	if b, ok := cfg.Backends["github"]; ok {
		return "github", b, nil
	}
	for name, backend := range cfg.Backends {
		return name, backend, nil
	}
	return "", BackendConfig{}, fmt.Errorf("no gate backends configured")
}
