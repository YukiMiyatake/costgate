package codemode

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/env"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	defaultMinChars = 3000
	defaultMaxChars = 6000
)

var fileTools = map[string]bool{
	"get_file_contents": true,
	"read_file":         true,
}

// Enabled reports whether code-mode outline transform is active.
func Enabled() bool {
	return env.Bool("COSTGATE_CODE_MODE", false)
}

// MinChars is the minimum text size before outline transform runs.
func MinChars() int {
	return intEnv("COSTGATE_CODE_MODE_MIN_CHARS", defaultMinChars, 500)
}

// MaxChars is the max outline output size (then compress may apply).
func MaxChars() int {
	return intEnv("COSTGATE_CODE_MODE_MAX_CHARS", defaultMaxChars, 500)
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

// Applies reports whether a tool name is eligible for code-mode.
func Applies(tool string) bool {
	return fileTools[tool]
}

// PathFromArgs extracts a file path hint from tool arguments.
func PathFromArgs(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var args map[string]any
	if err := json.Unmarshal(raw, &args); err != nil {
		return ""
	}
	if p, ok := args["path"].(string); ok {
		return p
	}
	return ""
}

// Stats describes a code-mode pass.
type Stats struct {
	Tool        string
	BeforeChars int
	AfterChars  int
	Applied     bool
	Language    string
}

// MaybeTransform replaces large source files with a signature outline.
func MaybeTransform(tool, pathHint string, result *mcp.CallToolResult) (*mcp.CallToolResult, Stats) {
	stats := Stats{Tool: tool}
	if result == nil || !Enabled() || !Applies(tool) {
		return result, stats
	}

	lang := langFromPath(pathHint)
	if lang == langSkip {
		return result, stats
	}

	out := cloneResult(result)
	for i, item := range out.Content {
		text, ok := item.(*mcp.TextContent)
		if !ok {
			continue
		}
		stats.BeforeChars += len(text.Text)
		if len(text.Text) < MinChars() {
			stats.AfterChars += len(text.Text)
			continue
		}
		outline := buildOutline(text.Text, pathHint, lang)
		if outline == "" || len(outline) >= len(text.Text) {
			stats.AfterChars += len(text.Text)
			continue
		}
		if len(outline) > MaxChars() {
			outline = outline[:MaxChars()] + "\n\n[costgate: outline truncated]\n"
		}
		out.Content[i] = &mcp.TextContent{Text: outline}
		stats.AfterChars += len(outline)
		stats.Applied = true
		stats.Language = string(lang)
	}

	return out, stats
}

func cloneResult(result *mcp.CallToolResult) *mcp.CallToolResult {
	out := *result
	out.Content = append([]mcp.Content(nil), result.Content...)
	return &out
}

type langID string

const (
	langGo    langID = "go"
	langJS    langID = "javascript"
	langPy    langID = "python"
	langSkip  langID = ""
	langPlain langID = "plain"
)

func langFromPath(path string) langID {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".go":
		return langGo
	case ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs":
		return langJS
	case ".py":
		return langPy
	case ".json", ".lock", ".md", ".txt", ".yaml", ".yml", ".csv":
		return langSkip
	default:
		if path == "" {
			return langPlain
		}
		return langSkip
	}
}

func buildOutline(text, path string, lang langID) string {
	if lang == langPlain {
		lang = guessLang(text)
	}
	if lang == langSkip {
		return ""
	}

	lines := strings.Split(text, "\n")
	matchers := matchersFor(lang)
	var sigs []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "#") {
			continue
		}
		for _, re := range matchers {
			if re.MatchString(line) {
				sigs = append(sigs, truncateLine(strings.TrimRight(line, "\r"), 240))
				break
			}
		}
	}
	if len(sigs) == 0 {
		return ""
	}

	label := path
	if label == "" {
		label = "(source)"
	}
	header := strings.Join([]string{
		"[costgate code-mode: outline]",
		"file: " + label,
		"lines: " + strconv.Itoa(len(lines)),
		"signatures: " + strconv.Itoa(len(sigs)),
		"",
	}, "\n")
	return header + strings.Join(sigs, "\n")
}

func guessLang(text string) langID {
	lines := strings.Split(text, "\n")
	limit := min(40, len(lines))
	for i := 0; i < limit; i++ {
		line := lines[i]
		if strings.HasPrefix(strings.TrimSpace(line), "package ") {
			return langGo
		}
		if strings.Contains(line, "function ") || strings.Contains(line, "export ") {
			return langJS
		}
		if strings.HasPrefix(strings.TrimSpace(line), "def ") {
			return langPy
		}
	}
	return langSkip
}

func matchersFor(lang langID) []*regexp.Regexp {
	switch lang {
	case langGo:
		return []*regexp.Regexp{
			regexp.MustCompile(`^\s*(package|import|func|type|interface|const|var)\s`),
		}
	case langJS:
		return []*regexp.Regexp{
			regexp.MustCompile(`^\s*(export\s+)?(import|function|class|interface|type|const|enum)\s`),
		}
	case langPy:
		return []*regexp.Regexp{
			regexp.MustCompile(`^\s*(import|from|def|class|async def)\s`),
		}
	default:
		return nil
	}
}

func truncateLine(line string, max int) string {
	if len(line) <= max {
		return line
	}
	return line[:max] + "…"
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
