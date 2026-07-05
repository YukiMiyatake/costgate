package compress

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/env"
)

const defaultJSONMaxKeys = 20
const defaultJSONMaxArray = 5

// JSONEnabled reports whether JSON-aware summarization is active.
func JSONEnabled() bool {
	if v := strings.TrimSpace(os.Getenv("COSTGATE_COMPRESS_JSON")); v != "" {
		return env.Bool("COSTGATE_COMPRESS_JSON", false)
	}
	return Enabled()
}

func jsonMaxKeys() int {
	return intEnv("COSTGATE_COMPRESS_JSON_MAX_KEYS", defaultJSONMaxKeys, 3)
}

func jsonMaxArray() int {
	return intEnv("COSTGATE_COMPRESS_JSON_MAX_ARRAY", defaultJSONMaxArray, 1)
}

func intEnv(key string, defaultVal, floor int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < floor {
		return defaultVal
	}
	return n
}

func looksLikeJSON(text string) bool {
	trimmed := strings.TrimSpace(text)
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")
}

func maybeSummarizeJSON(text string) (string, bool) {
	if !JSONEnabled() || !looksLikeJSON(text) {
		return text, false
	}
	trimmed := strings.TrimSpace(text)
	var parsed any
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return text, false
	}
	summary := summarizeValue(parsed, 0)
	if summary == "" {
		return text, false
	}
	header := fmt.Sprintf(
		"[costgate: json summary — %d chars → %d chars]\n",
		len(text), len(summary),
	)
	return header + summary, true
}

func summarizeValue(v any, depth int) string {
	switch t := v.(type) {
	case map[string]any:
		return summarizeObject(t, depth)
	case []any:
		return summarizeArray(t, depth)
	default:
		b, _ := json.Marshal(t)
		s := string(b)
		if len(s) > 120 {
			return s[:120] + "…"
		}
		return s
	}
}

func summarizeObject(obj map[string]any, depth int) string {
	keys := make([]string, 0, len(obj))
	for k := range obj {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	max := jsonMaxKeys()
	if len(keys) > max {
		keys = keys[:max]
	}

	var lines []string
	lines = append(lines, "{")
	for _, k := range keys {
		val := summarizeValue(obj[k], depth+1)
		lines = append(lines, fmt.Sprintf("  %q: %s,", k, val))
	}
	if len(obj) > max {
		lines = append(lines, fmt.Sprintf("  … +%d keys", len(obj)-max))
	}
	lines = append(lines, "}")
	return strings.Join(lines, "\n")
}

func summarizeArray(arr []any, depth int) string {
	max := jsonMaxArray()
	n := len(arr)
	if n > max {
		arr = arr[:max]
	}
	var parts []string
	for _, item := range arr {
		parts = append(parts, summarizeValue(item, depth+1))
	}
	summary := "[" + strings.Join(parts, ", ") + "]"
	if n > max {
		summary += fmt.Sprintf(" … +%d items", n-max)
	}
	return summary
}
