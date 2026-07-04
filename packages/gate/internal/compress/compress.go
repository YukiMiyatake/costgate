package compress

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const defaultMaxChars = 12000

// Enabled reports whether response compression is active.
func Enabled() bool {
	v := strings.TrimSpace(os.Getenv("COSTGATE_COMPRESS"))
	if v == "" {
		return false
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

// MaxChars returns the max total text characters kept in a tool result.
func MaxChars() int {
	v := strings.TrimSpace(os.Getenv("COSTGATE_COMPRESS_MAX_CHARS"))
	if v == "" {
		return defaultMaxChars
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 500 {
		return defaultMaxChars
	}
	return n
}

// Stats describes a compression pass.
type Stats struct {
	Tool         string
	BeforeChars  int
	AfterChars   int
	Applied      bool
}

// MaybeCompress truncates oversized text tool results when enabled.
func MaybeCompress(tool string, result *mcp.CallToolResult) (*mcp.CallToolResult, Stats) {
	stats := Stats{Tool: tool}
	if result == nil || !Enabled() {
		return result, stats
	}

	before := textChars(result)
	stats.BeforeChars = before
	if before <= MaxChars() {
		stats.AfterChars = before
		return result, stats
	}

	out := cloneResult(result)
	remaining := before - MaxChars()
	for i, item := range out.Content {
		text, ok := item.(*mcp.TextContent)
		if !ok || remaining <= 0 {
			continue
		}
		next, saved := truncateText(text.Text, remaining)
		out.Content[i] = &mcp.TextContent{Text: next}
		remaining -= saved
	}

	stats.AfterChars = textChars(out)
	stats.Applied = stats.AfterChars < stats.BeforeChars
	if stats.Applied {
		log.Printf(
			"[costgate-gate] compress tool=%s chars %d→%d (max=%d)",
			tool, stats.BeforeChars, stats.AfterChars, MaxChars(),
		)
	}
	return out, stats
}

func cloneResult(result *mcp.CallToolResult) *mcp.CallToolResult {
	out := *result
	out.Content = append([]mcp.Content(nil), result.Content...)
	return &out
}

func textChars(result *mcp.CallToolResult) int {
	total := 0
	for _, item := range result.Content {
		if text, ok := item.(*mcp.TextContent); ok {
			total += len(text.Text)
		}
	}
	return total
}

func truncateText(text string, maxRemove int) (string, int) {
	if maxRemove <= 0 || len(text) == 0 {
		return text, 0
	}
	if maxRemove >= len(text)-100 {
		maxRemove = len(text) - 100
	}
	if maxRemove <= 0 {
		return text, 0
	}

	target := len(text) - maxRemove
	note := fmt.Sprintf(
		"\n\n[costgate: truncated %d chars → %d chars]\n\n",
		len(text), target,
	)
	budget := target - len(note)
	if budget < 200 {
		trimmed := text[:target]
		return trimmed, len(text) - len(trimmed)
	}

	head := budget * 7 / 10
	tail := budget - head
	trimmed := text[:head] + note + text[len(text)-tail:]
	return trimmed, len(text) - len(trimmed)
}
