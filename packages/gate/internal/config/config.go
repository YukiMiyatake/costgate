// Package config loads Gate runtime settings.
package config

// Config holds gateway configuration (backends, filter tiers, etc.).
type Config struct {
	Backends map[string]Backend `yaml:"backends"`
}

// Backend describes a downstream MCP server to delegate to.
type Backend struct {
	Command string   `yaml:"command"`
	Args    []string `yaml:"args"`
	Env     []string `yaml:"env,omitempty"`
}
