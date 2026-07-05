package codemode

import (
	"regexp"
	"strings"
)

func extractRegexOutline(text string, lang langID) ([]string, bool) {
	matchers := matchersFor(lang)
	if len(matchers) == 0 {
		return nil, false
	}

	lines := strings.Split(text, "\n")
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
		return nil, false
	}
	return sigs, true
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
