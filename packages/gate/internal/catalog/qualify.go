package catalog

import (
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// QualifyName joins backend and tool as "backend/tool".
func QualifyName(backend, tool string) string {
	return backend + "/" + tool
}

// SplitQualified splits "backend/tool" into backend and tool.
func SplitQualified(name string) (backend, tool string, ok bool) {
	i := strings.Index(name, "/")
	if i <= 0 || i >= len(name)-1 {
		return "", "", false
	}
	return name[:i], name[i+1:], true
}

// QualifyTool returns a copy of tool with a qualified name.
func QualifyTool(backend string, tool *mcp.Tool) *mcp.Tool {
	if tool == nil {
		return nil
	}
	copy := *tool
	copy.Name = QualifyName(backend, tool.Name)
	return &copy
}
