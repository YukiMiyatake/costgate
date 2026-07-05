package result

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"sync"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/env"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var (
	dedupeMu    sync.RWMutex
	dedupeCache = map[string]string{}
)

func dedupeEnabled() bool {
	return env.Bool("COSTGATE_DEDUPE", true)
}

func cacheKey(tool string, rawArgs json.RawMessage) string {
	h := sha256.Sum256(append([]byte(tool+":"), rawArgs...))
	return hex.EncodeToString(h[:8])
}

func textFingerprint(result *mcp.CallToolResult) string {
	if result == nil {
		return ""
	}
	var parts []string
	for _, item := range result.Content {
		if text, ok := item.(*mcp.TextContent); ok {
			parts = append(parts, text.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func maybeDedupe(tool string, rawArgs json.RawMessage, result *mcp.CallToolResult) *mcp.CallToolResult {
	if result == nil || !dedupeEnabled() {
		return result
	}
	fp := textFingerprint(result)
	if fp == "" {
		return result
	}
	key := cacheKey(tool, rawArgs)

	dedupeMu.RLock()
	prev, hit := dedupeCache[key]
	dedupeMu.RUnlock()

	if hit && prev == fp {
		out := cloneForDedupe(result)
		note := "\n\n[costgate: dedupe cache hit]\n"
		if text, ok := out.Content[0].(*mcp.TextContent); ok {
			text.Text = text.Text + note
		}
		return out
	}

	dedupeMu.Lock()
	dedupeCache[key] = fp
	dedupeMu.Unlock()
	return result
}

func cloneForDedupe(result *mcp.CallToolResult) *mcp.CallToolResult {
	out := *result
	out.Content = append([]mcp.Content(nil), result.Content...)
	return &out
}

// ResetDedupeCache clears the session dedupe cache (tests).
func ResetDedupeCache() {
	dedupeMu.Lock()
	dedupeCache = map[string]string{}
	dedupeMu.Unlock()
}
