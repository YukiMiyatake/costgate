package usage

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func writeTurnsLog(t *testing.T, dir string, lines ...string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	body := ""
	for _, line := range lines {
		body += line + "\n"
	}
	if err := os.WriteFile(filepath.Join(dir, "turns.jsonl"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestGenerationActiveAt(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("COSTGATE_HISTORY_DIR", dir)
	writeTurnsLog(t, dir,
		`{"type":"turn","ts":"2026-06-10T09:00:00.000Z","conversation_id":"conv-1","generation_id":"gen-1","workspace_root":"/work/costgate"}`,
		`{"type":"turn","ts":"2026-06-10T09:10:00.000Z","conversation_id":"conv-1","generation_id":"gen-2","workspace_root":"/work/costgate"}`,
	)

	at, _ := time.Parse(time.RFC3339, "2026-06-10T09:05:00Z")
	gen, conv, ok := GenerationActiveAt(at, "/work/costgate")
	if !ok || gen != "gen-1" || conv != "conv-1" {
		t.Fatalf("expected gen-1, got ok=%v gen=%q conv=%q", ok, gen, conv)
	}

	at2, _ := time.Parse(time.RFC3339, "2026-06-10T09:12:00Z")
	gen2, _, ok2 := GenerationActiveAt(at2, "/work/costgate")
	if !ok2 || gen2 != "gen-2" {
		t.Fatalf("expected gen-2, got ok=%v gen=%q", ok2, gen2)
	}
}

func TestLogCorrelationFieldsUsesHistoryWhenLatestStale(t *testing.T) {
	intentDir := t.TempDir()
	historyDir := t.TempDir()
	t.Setenv("COSTGATE_PROMPT_INTENT_DIR", intentDir)
	t.Setenv("COSTGATE_HISTORY_DIR", historyDir)

	stale := time.Now().Add(-2 * time.Hour).UnixMilli()
	writePromptIntentLatest(t, intentDir, `{"generation_id":"stale-gen","workspace_root":"/work/costgate","ts":`+strconv.FormatInt(stale, 10)+`}`)
	writeTurnsLog(t, historyDir,
		`{"type":"turn","ts":"`+time.Now().UTC().Add(-5*time.Minute).Format(time.RFC3339)+`","conversation_id":"conv-live","generation_id":"gen-live","workspace_root":"/work/costgate"}`,
	)

	fields := LogCorrelationFields(intentDir, "/work/costgate")
	if fields["generation_id"] != "gen-live" {
		t.Fatalf("expected gen-live from history, got %#v", fields)
	}
}
