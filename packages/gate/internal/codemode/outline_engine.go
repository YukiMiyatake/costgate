package codemode

import (
	"os"
	"strings"
)

type outlineEngine string

const (
	engineAuto  outlineEngine = "auto"
	engineAST   outlineEngine = "ast"
	engineRegex outlineEngine = "regex"
)

func outlineEngineMode() outlineEngine {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("COSTGATE_CODE_MODE_ENGINE")))
	switch v {
	case "ast", "scanner":
		return engineAST
	case "regex":
		return engineRegex
	default:
		return engineAuto
	}
}

func extractOutline(text, path string, lang langID) ([]string, outlineEngine) {
	mode := outlineEngineMode()
	if mode == engineRegex {
		if sigs, ok := extractRegexOutline(text, lang); ok {
			return sigs, engineRegex
		}
		return nil, engineRegex
	}

	if mode == engineAST || mode == engineAuto {
		switch lang {
		case langGo:
			if sigs, ok := extractGoOutline(text, path); ok {
				return sigs, engineAST
			}
		case langJS:
			if sigs, ok := extractJavaScriptOutline(text); ok {
				return sigs, engineAST
			}
		case langPy:
			if sigs, ok := extractPythonOutline(text); ok {
				return sigs, engineAST
			}
		}
	}

	if mode == engineAST {
		return nil, engineAST
	}

	if sigs, ok := extractRegexOutline(text, lang); ok {
		return sigs, engineRegex
	}
	return nil, engineRegex
}

func advanceAfterSignature(lines []string, start int, sig string) int {
	return start + strings.Count(sig, "\n")
}
