package usage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type promptIntentRecord struct {
	Keywords string `json:"keywords"`
	TS       int64  `json:"ts"`
}

// ResolvePromptIntentDir returns COSTGATE_PROMPT_INTENT_DIR or ~/.costgate/prompt-intent.
func ResolvePromptIntentDir(dir string) string {
	if dir != "" {
		return dir
	}
	if p := os.Getenv("COSTGATE_PROMPT_INTENT_DIR"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".costgate", "prompt-intent")
	}
	return filepath.Join(home, ".costgate", "prompt-intent")
}

func promptIntentWindow(within time.Duration) time.Duration {
	if within > 0 {
		return within
	}
	if w := strings.TrimSpace(os.Getenv("COSTGATE_PROMPT_INTENT_WINDOW")); w != "" {
		if d, err := time.ParseDuration(w); err == nil && d > 0 {
			return d
		}
	}
	return 10 * time.Minute
}

// RecentPromptIntentKeywords reads ~/.costgate/prompt-intent/latest.json when fresh.
func RecentPromptIntentKeywords(dir string, within time.Duration) string {
	path := filepath.Join(ResolvePromptIntentDir(dir), "latest.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var rec promptIntentRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return ""
	}
	if rec.TS <= 0 {
		return ""
	}
	ts := time.UnixMilli(rec.TS)
	if time.Since(ts) > promptIntentWindow(within) {
		return ""
	}
	return strings.TrimSpace(rec.Keywords)
}
