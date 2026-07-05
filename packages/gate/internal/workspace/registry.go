package workspace

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Entry is one workspace seen by Gate (Phase 28 Activity Registry).
type Entry struct {
	Path     string    `json:"path"`
	Label    string    `json:"label"`
	LastSeen time.Time `json:"last_seen"`
	HasConfig bool     `json:"has_config"`
	Pinned   bool      `json:"pinned,omitempty"`
}

// Registry is persisted at ~/.costgate/workspace-registry.json.
type Registry struct {
	Version    int     `json:"version"`
	Workspaces []Entry `json:"workspaces"`
}

// ResolveRegistryPath returns COSTGATE_WORKSPACE_REGISTRY or ~/.costgate/workspace-registry.json.
func ResolveRegistryPath() string {
	if p := os.Getenv("COSTGATE_WORKSPACE_REGISTRY"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "workspace-registry.json"
	}
	return filepath.Join(home, ".costgate", "workspace-registry.json")
}

// ResolveProjectRoot returns COSTGATE_PROJECT_ROOT or empty.
func ResolveProjectRoot() string {
	return strings.TrimSpace(os.Getenv("COSTGATE_PROJECT_ROOT"))
}

func labelForPath(abs string) string {
	return filepath.Base(abs)
}

func hasWorkspaceConfig(abs string) bool {
	st, err := os.Stat(filepath.Join(abs, ".costgate", "backends.json"))
	return err == nil && !st.IsDir()
}

// Load reads registry or returns empty.
func Load(path string) (*Registry, error) {
	if path == "" {
		path = ResolveRegistryPath()
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &Registry{Version: 1, Workspaces: []Entry{}}, nil
		}
		return nil, err
	}
	var reg Registry
	if err := json.Unmarshal(data, &reg); err != nil {
		return nil, err
	}
	if reg.Version == 0 {
		reg.Version = 1
	}
	if reg.Workspaces == nil {
		reg.Workspaces = []Entry{}
	}
	return &reg, nil
}

// Save writes registry atomically (best-effort mkdir).
func Save(reg *Registry, path string) error {
	if path == "" {
		path = ResolveRegistryPath()
	}
	if reg.Version == 0 {
		reg.Version = 1
	}
	payload, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Touch records or updates a workspace path (Gate startup).
func Touch(projectRoot string, registryPath string) error {
	root := strings.TrimSpace(projectRoot)
	if root == "" {
		return nil
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	reg, err := Load(registryPath)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	found := false
	for i, w := range reg.Workspaces {
		if filepath.Clean(w.Path) == filepath.Clean(abs) {
			reg.Workspaces[i].LastSeen = now
			reg.Workspaces[i].Label = labelForPath(abs)
			reg.Workspaces[i].HasConfig = hasWorkspaceConfig(abs)
			found = true
			break
		}
	}
	if !found {
		reg.Workspaces = append(reg.Workspaces, Entry{
			Path:      abs,
			Label:     labelForPath(abs),
			LastSeen:  now,
			HasConfig: hasWorkspaceConfig(abs),
		})
	}
	return Save(reg, registryPath)
}

// RegisterFromEnv touches registry when COSTGATE_PROJECT_ROOT is set.
func RegisterFromEnv() {
	root := ResolveProjectRoot()
	if root == "" {
		return
	}
	_ = Touch(root, "")
}
