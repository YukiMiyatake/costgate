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

// Resolve merges static COSTGATE_INTENT with recent tool usage keywords.
func Resolve(store *usage.Store, static string) string {
	static = strings.TrimSpace(static)
	if !DynamicEnabled() || store == nil {
		return static
	}
	recent := store.RecentKeywords(defaultMaxRecent, defaultWindow)
	if recent == "" {
		return static
	}
	if static == "" {
		return recent
	}
	return static + " " + recent
}
