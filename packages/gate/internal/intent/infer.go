package intent

import (
	"strings"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/env"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
)

const (
	defaultMaxRecent = 5
	defaultWindow    = 30 * time.Minute
)

// DynamicEnabled reports whether usage-based intent inference is active.
func DynamicEnabled() bool {
	return env.Bool("COSTGATE_INTENT_DYNAMIC", true)
}

// ProbeIntentEnabled reports whether fresh Probe JSONL keywords augment intent.
func ProbeIntentEnabled() bool {
	return env.Bool("COSTGATE_INTENT_PROBE", true)
}

// Resolve merges static COSTGATE_INTENT with probe log + usage keywords.
func Resolve(store *usage.Store, static string) string {
	static = strings.TrimSpace(static)
	if !DynamicEnabled() {
		return static
	}

	var parts []string
	if static != "" {
		parts = append(parts, static)
	}

	if ProbeIntentEnabled() {
		if probe := usage.RecentProbeLogKeywords("", defaultMaxRecent, defaultWindow); probe != "" {
			parts = append(parts, probe)
		}
	}

	if store != nil {
		if recent := store.RecentKeywords(defaultMaxRecent, defaultWindow); recent != "" {
			parts = append(parts, recent)
		}
	}

	return strings.TrimSpace(strings.Join(parts, " "))
}
