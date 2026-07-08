package usage

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type historyTurnRow struct {
	TS             string `json:"ts"`
	ConversationID string `json:"conversation_id"`
	GenerationID   string `json:"generation_id"`
	WorkspaceRoot  string `json:"workspace_root"`
}

// ResolveHistoryDir returns COSTGATE_HISTORY_DIR or ~/.costgate/history.
func ResolveHistoryDir() string {
	if d := os.Getenv("COSTGATE_HISTORY_DIR"); d != "" {
		return d
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".costgate", "history")
	}
	return filepath.Join(home, ".costgate", "history")
}

func turnsLogPath() string {
	return filepath.Join(ResolveHistoryDir(), "turns.jsonl")
}

func parseTurnTS(ts string) (time.Time, bool) {
	ts = strings.TrimSpace(ts)
	if ts == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		t, err = time.Parse(time.RFC3339, ts)
	}
	if err != nil {
		return time.Time{}, false
	}
	return t.UTC(), true
}

func workspaceMatch(turnRoot, projectRoot string) bool {
	if turnRoot == "" || projectRoot == "" {
		return true
	}
	return filepath.Clean(turnRoot) == filepath.Clean(projectRoot)
}

// GenerationActiveAt finds the prompt turn active at event time from history/turns.jsonl.
func GenerationActiveAt(at time.Time, projectRoot string) (generationID, conversationID string, ok bool) {
	path := turnsLogPath()
	f, err := os.Open(path)
	if err != nil {
		return "", "", false
	}
	defer f.Close()

	var turns []historyTurnRow
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var row historyTurnRow
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			continue
		}
		if row.GenerationID == "" {
			continue
		}
		if !workspaceMatch(row.WorkspaceRoot, projectRoot) {
			continue
		}
		turns = append(turns, row)
	}
	if len(turns) == 0 {
		return "", "", false
	}

	sort.Slice(turns, func(i, j int) bool {
		ti, oki := parseTurnTS(turns[i].TS)
		tj, okj := parseTurnTS(turns[j].TS)
		if !oki {
			return false
		}
		if !okj {
			return true
		}
		return ti.Before(tj)
	})

	at = at.UTC()
	for i := len(turns) - 1; i >= 0; i-- {
		turnTS, okTS := parseTurnTS(turns[i].TS)
		if !okTS || at.Before(turnTS) {
			continue
		}
		var end time.Time
		if i+1 < len(turns) {
			if nextTS, okNext := parseTurnTS(turns[i+1].TS); okNext {
				end = nextTS
			}
		}
		if end.IsZero() {
			end = turnTS.Add(30 * time.Minute)
		}
		if !at.Before(end) {
			continue
		}
		return turns[i].GenerationID, turns[i].ConversationID, true
	}
	return "", "", false
}
