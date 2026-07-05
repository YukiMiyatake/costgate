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

type probeCallItem struct {
	tool string
	used time.Time
}

// RecentProbeLogKeywords reads fresh tool_call names from Probe JSONL (not usage store).
func RecentProbeLogKeywords(logDir string, maxTools int, within time.Duration) string {
	if logDir == "" {
		if p := os.Getenv("COSTGATE_PROBE_LOG_DIR"); p != "" {
			logDir = p
		} else {
			home, err := os.UserHomeDir()
			if err != nil {
				return ""
			}
			logDir = filepath.Join(home, ".costgate", "logs")
		}
	}
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return ""
	}
	if maxTools <= 0 {
		maxTools = 5
	}
	cutoff := time.Now().UTC().Add(-within)

	var recent []probeCallItem

	for _, ent := range entries {
		if ent.IsDir() || !strings.HasPrefix(ent.Name(), "probe-") || !strings.HasSuffix(ent.Name(), ".jsonl") {
			continue
		}
		collectProbeCalls(filepath.Join(logDir, ent.Name()), cutoff, &recent)
	}

	sort.Slice(recent, func(i, j int) bool {
		return recent[i].used.After(recent[j].used)
	})
	if len(recent) > maxTools {
		recent = recent[:maxTools]
	}

	seen := map[string]bool{}
	var tokens []string
	for _, it := range recent {
		phrase := strings.ReplaceAll(it.tool, "_", " ")
		for _, word := range strings.Fields(phrase) {
			word = strings.ToLower(word)
			if len(word) < 3 || keywordStopWords[word] || seen[word] {
				continue
			}
			seen[word] = true
			tokens = append(tokens, word)
		}
	}
	return strings.Join(tokens, " ")
}

func collectProbeCalls(path string, cutoff time.Time, recent *[]probeCallItem) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var row struct {
			Type string `json:"type"`
			Tool string `json:"tool"`
			TS   string `json:"ts"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil || row.Type != "tool_call" || row.Tool == "" {
			continue
		}
		t, err := time.Parse(time.RFC3339, row.TS)
		if err != nil || t.Before(cutoff) {
			continue
		}
		*recent = append(*recent, probeCallItem{tool: row.Tool, used: t})
	}
}
