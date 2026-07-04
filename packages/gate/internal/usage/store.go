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

// ToolStats holds per-tool usage counters.
type ToolStats struct {
	CallCount int64     `json:"call_count"`
	LastUsed  time.Time `json:"last_used,omitempty"`
}

// Store persists tool usage for tier classification.
type Store struct {
	path  string
	Tools map[string]ToolStats `json:"tools"`
}

// ResolvePath returns COSTGATE_USAGE_PATH or ~/.costgate/usage.json.
func ResolvePath() string {
	if p := os.Getenv("COSTGATE_USAGE_PATH"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "usage.json"
	}
	return filepath.Join(home, ".costgate", "usage.json")
}

// Load opens an existing store or creates an empty one.
func Load() (*Store, error) {
	path := ResolvePath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &Store{path: path, Tools: map[string]ToolStats{}}, nil
		}
		return nil, err
	}
	var s Store
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	s.path = path
	if s.Tools == nil {
		s.Tools = map[string]ToolStats{}
	}
	return &s, nil
}

// Record increments usage for a tool.
func (s *Store) Record(tool string) {
	if tool == "" {
		return
	}
	st := s.Tools[tool]
	st.CallCount++
	st.LastUsed = time.Now().UTC()
	s.Tools[tool] = st
}

// Save writes the store to disk.
func (s *Store) Save() error {
	if s.path == "" {
		s.path = ResolvePath()
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}

// ImportProbeLogs merges tool_call events from Probe JSONL logs.
func (s *Store) ImportProbeLogs(logDir string) error {
	if logDir == "" {
		if p := os.Getenv("COSTGATE_PROBE_LOG_DIR"); p != "" {
			logDir = p
		} else {
			home, err := os.UserHomeDir()
			if err != nil {
				return nil
			}
			logDir = filepath.Join(home, ".costgate", "logs")
		}
	}

	entries, err := os.ReadDir(logDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, ent := range entries {
		if ent.IsDir() || !strings.HasPrefix(ent.Name(), "probe-") || !strings.HasSuffix(ent.Name(), ".jsonl") {
			continue
		}
		if err := s.importJSONL(filepath.Join(logDir, ent.Name())); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) importJSONL(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var row struct {
			Type   string `json:"type"`
			Tool   string `json:"tool"`
			TS     string `json:"ts"`
			Backend string `json:"backend"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil || row.Type != "tool_call" || row.Tool == "" {
			continue
		}
		st := s.Tools[row.Tool]
		st.CallCount++
		if t, err := time.Parse(time.RFC3339, row.TS); err == nil {
			if st.LastUsed.IsZero() || t.After(st.LastUsed) {
				st.LastUsed = t
			}
		}
		s.Tools[row.Tool] = st
	}
	return scanner.Err()
}

// CallCount returns how many times a tool was recorded.
func (s *Store) CallCount(tool string) int64 {
	return s.Tools[tool].CallCount
}

var keywordStopWords = map[string]bool{
	"get": true, "set": true, "list": true, "create": true, "update": true,
	"delete": true, "add": true, "remove": true, "search": true, "find": true,
	"read": true, "write": true, "run": true, "call": true, "for": true, "the": true,
}

// RecentKeywords builds intent text from recently used tool names.
func (s *Store) RecentKeywords(maxTools int, within time.Duration) string {
	if s == nil || len(s.Tools) == 0 {
		return ""
	}
	if maxTools <= 0 {
		maxTools = 5
	}
	cutoff := time.Now().UTC().Add(-within)

	type item struct {
		name string
		used time.Time
	}
	var recent []item
	for name, st := range s.Tools {
		if st.LastUsed.IsZero() || st.LastUsed.Before(cutoff) {
			continue
		}
		recent = append(recent, item{name: name, used: st.LastUsed})
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
		phrase := strings.ReplaceAll(it.name, "_", " ")
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
