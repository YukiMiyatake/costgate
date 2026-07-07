package backend

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	defaultConnectTimeout    = 45 * time.Second
	heavyStdioConnectTimeout = 90 * time.Second
)

// Registry holds connected backend MCP sessions.
type Registry struct {
	names    []string
	sessions map[string]*mcp.ClientSession
	configs  map[string]config.BackendConfig
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
		configs:  map[string]config.BackendConfig{},
	}
	return r, nil
}

// ConnectAll connects every backend in cfg (parallel, per-backend timeout).
func ConnectAll(ctx context.Context, cfg config.GateConfig) (*Registry, error) {
	names := config.BackendNames(cfg)
	if len(names) == 0 {
		return nil, fmt.Errorf("no gate backends configured")
	}
	r := &Registry{
		names:    names,
		sessions: make(map[string]*mcp.ClientSession, len(names)),
		configs:  make(map[string]config.BackendConfig, len(names)),
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	errCh := make(chan error, len(names))

	for _, name := range names {
		name := name
		backendCfg := cfg.Backends[name]
		r.configs[name] = backendCfg
		wg.Add(1)
		go func() {
			defer wg.Done()
			timeout := connectTimeoutFor(name, backendCfg)
			connectCtx, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()
			session, err := Connect(connectCtx, name, backendCfg)
			if err != nil {
				errCh <- fmt.Errorf("backend %q: %w", name, err)
				return
			}
			mu.Lock()
			r.sessions[name] = session
			mu.Unlock()
		}()
	}

	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			r.Close()
			return nil, err
		}
	}
	return r, nil
}

func connectTimeoutFor(name string, cfg config.BackendConfig) time.Duration {
	if IsURLBackend(cfg) {
		return defaultConnectTimeout
	}
	if name == "serena" || strings.Contains(strings.Join(cfg.Args, " "), "serena") {
		return heavyStdioConnectTimeout
	}
	return defaultConnectTimeout
}

// Reconnect replaces one backend session (used after HTTP/SSE transport errors).
func (r *Registry) Reconnect(ctx context.Context, name string) error {
	if r == nil {
		return fmt.Errorf("registry is nil")
	}
	cfg, ok := r.configs[name]
	if !ok {
		return fmt.Errorf("unknown backend %q", name)
	}
	if old, ok := r.sessions[name]; ok && old != nil {
		old.Close()
		delete(r.sessions, name)
	}
	timeout := connectTimeoutFor(name, cfg)
	connectCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	session, err := Connect(connectCtx, name, cfg)
	if err != nil {
		return err
	}
	r.sessions[name] = session
	return nil
}

// IsURL reports whether a configured backend uses HTTP transport.
func (r *Registry) IsURL(name string) bool {
	if r == nil {
		return false
	}
	cfg, ok := r.configs[name]
	return ok && IsURLBackend(cfg)
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
