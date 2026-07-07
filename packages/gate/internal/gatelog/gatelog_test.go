package gatelog

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestLoggerWritesGateEvents(t *testing.T) {
	dir := t.TempDir()
	intentDir := t.TempDir()
	t.Setenv("COSTGATE_GATE_LOG", "1")
	t.Setenv("COSTGATE_GATE_LOG_DIR", dir)
	t.Setenv("COSTGATE_PROJECT_ROOT", "/work/costgate")
	t.Setenv("COSTGATE_PROMPT_INTENT_DIR", intentDir)

	ts := time.Now().UnixMilli()
	body := `{"keywords":"github","conversation_id":"conv-1","generation_id":"gen-1","workspace_root":"/work/costgate","ts":` +
		strconv.FormatInt(ts, 10) + `}`
	if err := os.WriteFile(filepath.Join(intentDir, "latest.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	l := New()
	l.logToolsList("github", 8, 1200)
	l.logToolCall("search_issues", 4096, true, 32000)

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 log file, got %d", len(entries))
	}
	if !strings.HasPrefix(entries[0].Name(), "gate-") {
		t.Fatalf("unexpected file name %q", entries[0].Name())
	}

	path := filepath.Join(dir, entries[0].Name())
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	var lines []map[string]any
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var row map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			t.Fatal(err)
		}
		lines = append(lines, row)
	}
	if len(lines) != 2 {
		t.Fatalf("expected 2 lines, got %d", len(lines))
	}

	list := lines[0]
	if list["type"] != "gate_event" || list["event"] != "tools_list" {
		t.Fatalf("unexpected tools_list row: %#v", list)
	}
	if list["backend"] != "github" || int(list["tools_exposed"].(float64)) != 8 {
		t.Fatalf("unexpected tools_list fields: %#v", list)
	}

	call := lines[1]
	if call["event"] != "tool_call" || call["tool"] != "search_issues" {
		t.Fatalf("unexpected tool_call row: %#v", call)
	}
	if call["compressed"] != true || call["ok"] != true {
		t.Fatalf("expected compressed=true ok=true, got %#v", call)
	}
	if call["project_root"] != "/work/costgate" {
		t.Fatalf("expected project_root, got %#v", call["project_root"])
	}
	if call["generation_id"] != "gen-1" || call["conversation_id"] != "conv-1" {
		t.Fatalf("expected correlation ids, got %#v", call)
	}
}

func TestLoggerWritesToolCallError(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("COSTGATE_GATE_LOG", "1")
	t.Setenv("COSTGATE_GATE_LOG_DIR", dir)

	l := New()
	l.logToolCallError("aieph/aieph_search", &simpleErr{"connection closed"})

	path := filepath.Join(dir, entriesName(dir, t))
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	if !scanner.Scan() {
		t.Fatal("expected one log line")
	}
	var row map[string]any
	if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
		t.Fatal(err)
	}
	if row["ok"] != false || row["error"] != "connection closed" {
		t.Fatalf("unexpected error row: %#v", row)
	}
}

func entriesName(dir string, t *testing.T) string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 log file, got %d", len(entries))
	}
	return entries[0].Name()
}

type simpleErr struct{ s string }

func (e *simpleErr) Error() string { return e.s }

func TestLoggerDisabled(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("COSTGATE_GATE_LOG", "0")
	t.Setenv("COSTGATE_GATE_LOG_DIR", dir)

	l := New()
	l.logToolCall("search_issues", 100, false, 0)

	entries, err := os.ReadDir(dir)
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no files when disabled, got %d", len(entries))
	}
}

func TestBytesToTokens(t *testing.T) {
	if got := BytesToTokens(0); got != 0 {
		t.Fatalf("expected 0, got %d", got)
	}
	if got := BytesToTokens(4); got != 1 {
		t.Fatalf("expected 1, got %d", got)
	}
	if got := BytesToTokens(5); got != 2 {
		t.Fatalf("expected 2, got %d", got)
	}
}
