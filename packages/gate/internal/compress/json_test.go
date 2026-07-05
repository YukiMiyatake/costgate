package compress

import (
	"strings"
	"testing"
)

func TestMaybeSummarizeJSON(t *testing.T) {
	t.Setenv("COSTGATE_COMPRESS", "1")
	t.Setenv("COSTGATE_COMPRESS_JSON", "1")

	raw := `{"dependencies":{"a":"` + strings.Repeat("x", 5000) + `","b":"y"},"lockfileVersion":3}`
	out, ok := maybeSummarizeJSON(raw)
	if !ok {
		t.Fatal("expected json summary")
	}
	if !strings.Contains(out, "[costgate: json summary") {
		t.Fatal("missing summary header")
	}
	if !strings.Contains(out, "dependencies") {
		t.Fatal("expected keys preserved")
	}
	if len(out) >= len(raw) {
		t.Fatalf("summary should shrink: before=%d after=%d", len(raw), len(out))
	}
}

func TestMaybeSummarizeJSONSkipsNonJSON(t *testing.T) {
	t.Setenv("COSTGATE_COMPRESS_JSON", "1")
	text := "plain text " + strings.Repeat("z", 100)
	out, ok := maybeSummarizeJSON(text)
	if ok || out != text {
		t.Fatal("non-json should pass through")
	}
}
