package codemode

import (
	"strings"
	"testing"
)

func TestExtractGoOutlineAST(t *testing.T) {
	src := strings.Join([]string{
		"package main",
		"",
		"// Hello greets the user.",
		"func hello(name string) {",
		`  fmt.Println(name)`,
		"}",
		"",
		"type Config struct {",
		"  Name string",
		"}",
	}, "\n")

	sigs, ok := extractGoOutline(src, "main.go")
	if !ok {
		t.Fatal("expected go ast outline")
	}
	joined := strings.Join(sigs, "\n")
	for _, want := range []string{"package main", "func hello(name string)", "type Config struct{...}", "Hello greets"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %q in:\n%s", want, joined)
		}
	}
}

func TestExtractJavaScriptOutlineScanner(t *testing.T) {
	src := strings.Join([]string{
		"export async function fetchData(",
		"  id: string,",
		"  opts?: { limit: number }",
		") {",
		"  return id;",
		"}",
		"",
		"export class Worker {",
		"  run() {}",
		"}",
	}, "\n")

	sigs, ok := extractJavaScriptOutline(src)
	if !ok {
		t.Fatal("expected js outline")
	}
	joined := strings.Join(sigs, "\n")
	if !strings.Contains(joined, "fetchData") {
		t.Fatalf("missing fetchData: %s", joined)
	}
	if !strings.Contains(joined, "class Worker") {
		t.Fatalf("missing Worker: %s", joined)
	}
}

func TestExtractPythonOutlineScanner(t *testing.T) {
	src := strings.Join([]string{
		"@dataclass",
		"class Config:",
		`  """Config doc."""`,
		"  name: str",
		"",
		"async def load(",
		"    path: str,",
		") -> None:",
		"  pass",
	}, "\n")

	sigs, ok := extractPythonOutline(src)
	if !ok {
		t.Fatal("expected python outline")
	}
	joined := strings.Join(sigs, "\n")
	for _, want := range []string{"@dataclass", "class Config:", "async def load(", "Config doc."} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %q in:\n%s", want, joined)
		}
	}
}

func TestBuildOutlineUsesASTEngine(t *testing.T) {
	t.Setenv("COSTGATE_CODE_MODE_ENGINE", "ast")
	src := strings.Join([]string{
		"package main",
		"",
		"func run() {",
		"  return",
		"}",
		strings.Repeat("// x\n", 200),
	}, "\n")
	out := buildOutline(src, "main.go", langGo)
	if !strings.Contains(out, "engine: ast") {
		t.Fatalf("expected ast engine header:\n%s", out)
	}
}

func TestBuildOutlineRegexFallback(t *testing.T) {
	t.Setenv("COSTGATE_CODE_MODE_ENGINE", "regex")
	src := strings.Join([]string{
		"package main",
		"func broken syntax {{{",
		strings.Repeat("// x\n", 200),
	}, "\n")
	out := buildOutline(src, "main.go", langGo)
	if !strings.Contains(out, "engine: regex") {
		t.Fatalf("expected regex fallback:\n%s", out)
	}
}
