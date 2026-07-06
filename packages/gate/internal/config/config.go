package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

// BackendConfig describes a downstream MCP server process.
type BackendConfig struct {
	Always  bool              `json:"always,omitempty"`
	Command string            `json:"command"`
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Cwd     string            `json:"cwd,omitempty"`
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
