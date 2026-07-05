package codemode

import (
	"regexp"
	"strings"
)

var jsDeclStart = regexp.MustCompile(`^\s*(export\s+default\s+|export\s+)?(async\s+)?(function\*?\s+|class\s+|interface\s+|type\s+|enum\s+|const\s+|let\s+|var\s+)`)

func extractJavaScriptOutline(text string) ([]string, bool) {
	lines := strings.Split(text, "\n")
	var sigs []string
	for i := 0; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "/*") {
			continue
		}
		if !jsDeclStart.MatchString(line) {
			continue
		}
		sig := collectJSSignature(lines, i)
		if sig == "" {
			continue
		}
		sigs = append(sigs, truncateLine(strings.TrimSpace(sig), 240))
		i = advanceAfterSignature(lines, i, sig)
	}
	if len(sigs) == 0 {
		return nil, false
	}
	return sigs, true
}

func collectJSSignature(lines []string, start int) string {
	var parts []string
	openParen := 0
	seenOpen := false
	for i := start; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		parts = append(parts, line)
		for _, ch := range line {
			switch ch {
			case '(', '[', '<':
				openParen++
				seenOpen = true
			case ')', ']', '>':
				if openParen > 0 {
					openParen--
				}
			case '{':
				return strings.Join(parts, "\n")
			case ';':
				if !seenOpen {
					return strings.Join(parts, " ")
				}
			}
		}
		if seenOpen && openParen == 0 && strings.Contains(line, ")") {
			trimmed := strings.TrimSpace(line)
			if strings.HasSuffix(trimmed, "{") {
				return strings.Join(parts, "\n")
			}
			if strings.HasSuffix(trimmed, ";") || !strings.Contains(trimmed, "{") {
				return strings.Join(parts, " ")
			}
		}
		if i-start > 8 {
			break
		}
	}
	return strings.Join(parts, " ")
}
