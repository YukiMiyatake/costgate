package result

import (
	"encoding/json"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/codemode"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/compress"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Process applies code-mode outline (optional) then response compression (optional).
func Process(tool string, rawArgs json.RawMessage, result *mcp.CallToolResult) *mcp.CallToolResult {
	if result == nil {
		return nil
	}
	path := codemode.PathFromArgs(rawArgs)
	out, _ := codemode.MaybeTransform(tool, path, result)
	out, _ = compress.MaybeCompress(tool, out)
	return maybeDedupe(tool, rawArgs, out)
}
