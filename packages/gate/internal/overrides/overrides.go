package overrides

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
)

// ToolOverride is a per-tool tier force from ~/.costgate/tool-overrides.json.
type ToolOverride struct {
	ForceTier    string `json:"force_tier"`
	AlwaysExpose bool   `json:"always_expose,omitempty"`
	ExcludeLock  bool   `json:"exclude_lock,omitempty"`
}

// File is the dashboard-written tool override store (Phase 24).
type File struct {
	Version int                      `json:"version"`
	Tools   map[string]ToolOverride  `json:"tools"`
}

// ResolvePath returns COSTGATE_TOOL_OVERRIDES or ~/.costgate/tool-overrides.json.
func ResolvePath() string {
	if p := os.Getenv("COSTGATE_TOOL_OVERRIDES"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "tool-overrides.json"
	}
	return filepath.Join(home, ".costgate", "tool-overrides.json")
}

// Load reads overrides or returns empty if missing.
func Load() (*File, error) {
	path := ResolvePath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &File{Version: 1, Tools: map[string]ToolOverride{}}, nil
		}
		return nil, err
	}
	var f File
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.Tools == nil {
		f.Tools = map[string]ToolOverride{}
	}
	if f.Version == 0 {
		f.Version = 1
	}
	return &f, nil
}

// Apply overlays user force_tier onto classified tiers.
func (f *File) Apply(classified map[string]filter.Tier) map[string]filter.Tier {
	if f == nil || len(f.Tools) == 0 {
		return classified
	}
	out := make(map[string]filter.Tier, len(classified))
	for name, tier := range classified {
		out[name] = tier
	}
	for name, ov := range f.Tools {
		if tier, ok := parseForceTier(ov.ForceTier); ok {
			applyForceTier(out, classified, name, tier)
			continue
		}
		if ov.AlwaysExpose {
			applyAlwaysExpose(out, classified, name)
		}
	}
	return out
}

func applyForceTier(out, classified map[string]filter.Tier, name string, tier filter.Tier) {
	for _, toolName := range bareOverrideTargets(classified, name) {
		out[toolName] = tier
	}
}

func applyAlwaysExpose(out, classified map[string]filter.Tier, name string) {
	for _, toolName := range bareOverrideTargets(classified, name) {
		out[toolName] = filter.TierA
	}
}

// bareOverrideTargets returns classified keys a bare override may affect.
// When multiple backends share the same bare tool name, returns nil (ambiguous).
func bareOverrideTargets(classified map[string]filter.Tier, name string) []string {
	if strings.Contains(name, "/") {
		if _, ok := classified[name]; ok {
			return []string{name}
		}
		return nil
	}
	if _, ok := classified[name]; ok {
		return []string{name}
	}
	var matches []string
	for toolName := range classified {
		if toolName == name {
			matches = append(matches, toolName)
			continue
		}
		if _, tool, ok := catalog.SplitQualified(toolName); ok && tool == name {
			matches = append(matches, toolName)
		}
	}
	if len(matches) != 1 {
		return nil
	}
	return matches
}

// FileModTime returns the overrides file mtime, or zero if missing.
func FileModTime() (time.Time, error) {
	path := ResolvePath()
	st, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return time.Time{}, nil
		}
		return time.Time{}, err
	}
	return st.ModTime(), nil
}

// Generation returns a short content hash for override sync status.
func (f *File) Generation() string {
	if f == nil || len(f.Tools) == 0 {
		sum := sha256.Sum256([]byte("empty"))
		return hex.EncodeToString(sum[:])[:16]
	}
	keys := make([]string, 0, len(f.Tools))
	for k := range f.Tools {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	h := sha256.New()
	for _, k := range keys {
		ov := f.Tools[k]
		_, _ = fmt.Fprintf(h, "%s|%s|%t|%t|", k, ov.ForceTier, ov.AlwaysExpose, ov.ExcludeLock)
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// ApplyInPlace overlays overrides onto classified tiers into dest (same map meta uses).
func (f *File) ApplyInPlace(classified map[string]filter.Tier, dest map[string]filter.Tier) {
	merged := f.Apply(classified)
	for k := range dest {
		if _, ok := merged[k]; !ok {
			delete(dest, k)
		}
	}
	for k, v := range merged {
		dest[k] = v
	}
}

func parseForceTier(label string) (filter.Tier, bool) {
	switch strings.ToUpper(strings.TrimSpace(label)) {
	case "A":
		return filter.TierA, true
	case "B":
		return filter.TierB, true
	case "C":
		return filter.TierC, true
	case "HIDDEN":
		return filter.TierHidden, true
	default:
		return filter.TierC, false
	}
}
