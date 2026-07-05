package codemode

import (
	"regexp"
	"strings"
)

var pyDeclStart = regexp.MustCompile(`^\s*(async\s+def\s+|def\s+|class\s+)`)

func extractPythonOutline(text string) ([]string, bool) {
	lines := strings.Split(text, "\n")
	var sigs []string
	var pendingDecorators []string

	for i := 0; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "@") {
			pendingDecorators = append(pendingDecorators, truncateLine(trimmed, 120))
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			continue
		}
		if !pyDeclStart.MatchString(line) {
			pendingDecorators = nil
			continue
		}

		sig := collectPythonSignature(lines, i)
		if sig == "" {
			pendingDecorators = nil
			continue
		}

		var block []string
		block = append(block, pendingDecorators...)
		if doc := readPythonDocstring(lines, i+1); doc != "" {
			block = append(block, `"""`+truncateLine(doc, 120)+`"""`)
		}
		block = append(block, truncateLine(strings.TrimSpace(sig), 240))
		sigs = append(sigs, strings.Join(block, "\n"))

		pendingDecorators = nil
		i = advanceAfterSignature(lines, i, sig)
	}

	if len(sigs) == 0 {
		return nil, false
	}
	return sigs, true
}

func collectPythonSignature(lines []string, start int) string {
	var parts []string
	for i := start; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		parts = append(parts, strings.TrimSpace(line))
		joined := strings.Join(parts, " ")
		if strings.Contains(joined, ":") {
			before, _, _ := strings.Cut(joined, ":")
			return strings.TrimSpace(before) + ":"
		}
		if i-start > 4 {
			break
		}
	}
	return strings.Join(parts, " ")
}

func readPythonDocstring(lines []string, start int) string {
	for j := start; j < len(lines) && j < start+3; j++ {
		trimmed := strings.TrimSpace(lines[j])
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, `"""`) || strings.HasPrefix(trimmed, "'''") {
			quote := trimmed[:3]
			content := strings.TrimPrefix(trimmed, quote)
			content = strings.TrimSuffix(content, quote)
			content = strings.TrimSpace(content)
			if content != "" {
				return content
			}
			if j+1 < len(lines) {
				return strings.TrimSpace(lines[j+1])
			}
		}
		break
	}
	return ""
}
