package usage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type promptIntentRecord struct {
	Keywords       string `json:"keywords"`
	ConversationID string `json:"conversation_id"`
	GenerationID   string `json:"generation_id"`
	WorkspaceRoot  string `json:"workspace_root"`
	TS             int64  `json:"ts"`
}

// PromptIntentRecord is the latest Cursor prompt-intent snapshot.
type PromptIntentRecord struct {
	Keywords       string
	ConversationID string
	GenerationID   string
	WorkspaceRoot  string
	TS             time.Time
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

func readPromptIntentRecord(dir string) (promptIntentRecord, bool) {
	path := filepath.Join(ResolvePromptIntentDir(dir), "latest.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return promptIntentRecord{}, false
	}
	var rec promptIntentRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return promptIntentRecord{}, false
	}
	if rec.TS <= 0 {
		return promptIntentRecord{}, false
	}
	return rec, true
}

// RecentPromptIntentRecord reads latest.json when within the freshness window.
func RecentPromptIntentRecord(dir string, within time.Duration) (PromptIntentRecord, bool) {
	rec, ok := readPromptIntentRecord(dir)
	if !ok {
		return PromptIntentRecord{}, false
	}
	ts := time.UnixMilli(rec.TS)
	if time.Since(ts) > promptIntentWindow(within) {
		return PromptIntentRecord{}, false
	}
	return PromptIntentRecord{
		Keywords:       strings.TrimSpace(rec.Keywords),
		ConversationID: strings.TrimSpace(rec.ConversationID),
		GenerationID:   strings.TrimSpace(rec.GenerationID),
		WorkspaceRoot:  strings.TrimSpace(rec.WorkspaceRoot),
		TS:             ts,
	}, true
}

// RecentPromptIntentKeywords reads ~/.costgate/prompt-intent/latest.json when fresh.
func RecentPromptIntentKeywords(dir string, within time.Duration) string {
	rec, ok := RecentPromptIntentRecord(dir, within)
	if !ok {
		return ""
	}
	return rec.Keywords
}

// LogCorrelationFields returns generation/conversation IDs for gate JSONL when fresh.
func LogCorrelationFields(dir, projectRoot string) map[string]string {
	rec, ok := RecentPromptIntentRecord(dir, 0)
	if ok && rec.GenerationID != "" {
		if rec.WorkspaceRoot == "" || projectRoot == "" || filepath.Clean(rec.WorkspaceRoot) == filepath.Clean(projectRoot) {
			out := map[string]string{"generation_id": rec.GenerationID}
			if rec.ConversationID != "" {
				out["conversation_id"] = rec.ConversationID
			}
			return out
		}
	}
	if gen, conv, ok := GenerationActiveAt(time.Now().UTC(), projectRoot); ok {
		out := map[string]string{"generation_id": gen}
		if conv != "" {
			out["conversation_id"] = conv
		}
		return out
	}
	return nil
}
