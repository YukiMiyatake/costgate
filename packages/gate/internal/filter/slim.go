package filter

import (
	"os"
	"strconv"
	"strings"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/env"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const defaultSlimDescMax = 120

// SlimListEnabled reports whether tools/list definitions are trimmed before exposure.
func SlimListEnabled() bool {
	return env.Bool("COSTGATE_SLIM_LIST", false)
}

// SlimListMaxChars is the max description length when slim list is on.
func SlimListMaxChars() int {
	v := strings.TrimSpace(os.Getenv("COSTGATE_SLIM_LIST_MAX_CHARS"))
	if v == "" {
		return defaultSlimDescMax
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 32 {
		return defaultSlimDescMax
	}
	return n
}

// PrepareToolForList returns a copy with a shorter description when slim list is enabled.
func PrepareToolForList(tool *mcp.Tool) *mcp.Tool {
	if !SlimListEnabled() || tool == nil {
		return tool
	}
	max := SlimListMaxChars()
	desc := strings.TrimSpace(tool.Description)
	if len(desc) <= max {
		return tool
	}
	copy := *tool
	copy.Description = desc[:max-3] + "..."
	return &copy
}

func slimExposedTools(tools []*mcp.Tool) []*mcp.Tool {
	if !SlimListEnabled() {
		return tools
	}
	out := make([]*mcp.Tool, len(tools))
	for i, tool := range tools {
		out[i] = PrepareToolForList(tool)
	}
	return out
}
