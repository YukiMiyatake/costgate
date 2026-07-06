package backend

import (
	"context"
	"fmt"
	"sort"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Registry holds connected backend MCP sessions.
type Registry struct {
	names    []string
	sessions map[string]*mcp.ClientSession
}

// NewRegistryForTest builds a registry from pre-connected sessions (tests only).
func NewRegistryForTest(names []string, sessions map[string]*mcp.ClientSession) (*Registry, error) {
	if len(names) == 0 {
		return nil, fmt.Errorf("no backends")
	}
	sorted := append([]string(nil), names...)
	sort.Strings(sorted)
	r := &Registry{
		names:    sorted,
		sessions: sessions,
	}
	return r, nil
}

// ConnectAll connects every backend in cfg.
func ConnectAll(ctx context.Context, cfg config.GateConfig) (*Registry, error) {
	names := config.BackendNames(cfg)
	if len(names) == 0 {
		return nil, fmt.Errorf("no gate backends configured")
	}
	r := &Registry{
		names:    names,
		sessions: make(map[string]*mcp.ClientSession, len(names)),
	}
	for _, name := range names {
		backendCfg := cfg.Backends[name]
		session, err := Connect(ctx, name, backendCfg)
		if err != nil {
			r.Close()
			return nil, err
		}
		r.sessions[name] = session
	}
	return r, nil
}

// Names returns sorted backend names.
func (r *Registry) Names() []string {
	if r == nil {
		return nil
	}
	out := make([]string, len(r.names))
	copy(out, r.names)
	return out
}

// Session returns a backend session by name.
func (r *Registry) Session(name string) (*mcp.ClientSession, bool) {
	if r == nil {
		return nil, false
	}
	s, ok := r.sessions[name]
	return s, ok
}

// Count returns the number of backends.
func (r *Registry) Count() int {
	if r == nil {
		return 0
	}
	return len(r.names)
}

// Single reports whether only one backend is configured.
func (r *Registry) Single() bool {
	return r.Count() == 1
}

// Close closes all backend sessions.
func (r *Registry) Close() {
	if r == nil {
		return
	}
	for name, session := range r.sessions {
		if session != nil {
			session.Close()
		}
		delete(r.sessions, name)
	}
}

// PrimaryName returns github if present, otherwise the first backend.
func (r *Registry) PrimaryName() string {
	if r == nil || len(r.names) == 0 {
		return ""
	}
	for _, name := range r.names {
		if name == "github" {
			return name
		}
	}
	return r.names[0]
}

// String returns a comma-separated list of backend names for logging.
func (r *Registry) String() string {
	return stringsJoin(r.names)
}

func stringsJoin(names []string) string {
	if len(names) == 0 {
		return ""
	}
	out := names[0]
	for _, n := range names[1:] {
		out += "," + n
	}
	return out
}

// SortedNames returns sorted keys from a backends map.
func SortedNames(backends map[string]config.BackendConfig) []string {
	names := make([]string, 0, len(backends))
	for name := range backends {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
