package usage

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func writePromptIntentLatest(t *testing.T, dir string, body string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "latest.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestRecentPromptIntentRecordFresh(t *testing.T) {
	dir := t.TempDir()
	ts := time.Now().UnixMilli()
	writePromptIntentLatest(t, dir, `{
		"keywords": "github pull request",
		"conversation_id": "conv-1",
		"generation_id": "gen-1",
		"workspace_root": "/work/costgate",
		"ts": `+strconv.FormatInt(ts, 10)+`
	}`)

	rec, ok := RecentPromptIntentRecord(dir, 10*time.Minute)
	if !ok {
		t.Fatal("expected fresh record")
	}
	if rec.Keywords != "github pull request" {
		t.Fatalf("keywords: %q", rec.Keywords)
	}
	if rec.GenerationID != "gen-1" || rec.ConversationID != "conv-1" {
		t.Fatalf("ids: %#v", rec)
	}
}

func TestRecentPromptIntentRecordStale(t *testing.T) {
	dir := t.TempDir()
	stale := time.Now().Add(-2 * time.Hour).UnixMilli()
	writePromptIntentLatest(t, dir, `{"keywords":"x","generation_id":"g","ts":`+strconv.FormatInt(stale, 10)+`}`)

	if _, ok := RecentPromptIntentRecord(dir, time.Minute); ok {
		t.Fatal("expected stale")
	}
}

func TestLogCorrelationFieldsWorkspaceMatch(t *testing.T) {
	dir := t.TempDir()
	ts := time.Now().UnixMilli()
	writePromptIntentLatest(t, dir, `{
		"generation_id": "gen-abc",
		"conversation_id": "conv-abc",
		"workspace_root": "/work/costgate",
		"ts": `+strconv.FormatInt(ts, 10)+`
	}`)

	fields := LogCorrelationFields(dir, "/work/costgate")
	if fields["generation_id"] != "gen-abc" {
		t.Fatalf("generation_id: %#v", fields)
	}
	if fields["conversation_id"] != "conv-abc" {
		t.Fatalf("conversation_id: %#v", fields)
	}
}

func TestLogCorrelationFieldsWorkspaceMismatch(t *testing.T) {
	dir := t.TempDir()
	ts := time.Now().UnixMilli()
	writePromptIntentLatest(t, dir, `{
		"generation_id": "gen-abc",
		"workspace_root": "/work/a",
		"ts": `+strconv.FormatInt(ts, 10)+`
	}`)

	if fields := LogCorrelationFields(dir, "/work/b"); len(fields) != 0 {
		t.Fatalf("expected no correlation, got %#v", fields)
	}
}
