package overrides

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
)

// ToolOverride is a per-tool tier force from ~/.costgate/tool-overrides.json.
type ToolOverride struct {
	ForceTier string `json:"force_tier"`
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
			out[name] = tier
		}
	}
	return out
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
