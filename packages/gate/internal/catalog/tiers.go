package catalog

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
)

//go:embed tiers/*.json
var tierFS embed.FS

// TierRules holds backend-specific Tier A/B/C overrides.
type TierRules struct {
	Backend     string            `json:"backend"`
	Description string            `json:"description,omitempty"`
	Overrides   map[string]string `json:"overrides"`
}

// LoadTierRules returns catalog tier rules for a backend name, or nil if none.
func LoadTierRules(backend string) (*TierRules, error) {
	name := strings.TrimSpace(backend)
	if name == "" {
		return nil, nil
	}
	path := fmt.Sprintf("tiers/%s.json", strings.ToLower(name))
	data, err := tierFS.ReadFile(path)
	if err != nil {
		return nil, nil
	}
	var rules TierRules
	if err := json.Unmarshal(data, &rules); err != nil {
		return nil, fmt.Errorf("parse tier rules %s: %w", path, err)
	}
	return &rules, nil
}

// Apply overlays explicit tier overrides onto classified tiers.
func (r *TierRules) Apply(classified map[string]filter.Tier) map[string]filter.Tier {
	if r == nil || len(r.Overrides) == 0 {
		return classified
	}
	out := make(map[string]filter.Tier, len(classified))
	for name, tier := range classified {
		out[name] = tier
	}
	for name, tierStr := range r.Overrides {
		if tier, ok := parseTierLabel(tierStr); ok {
			out[name] = tier
		}
	}
	return out
}

func parseTierLabel(label string) (filter.Tier, bool) {
	switch strings.ToUpper(strings.TrimSpace(label)) {
	case "A":
		return filter.TierA, true
	case "B":
		return filter.TierB, true
	case "C":
		return filter.TierC, true
	default:
		return filter.TierC, false
	}
}
