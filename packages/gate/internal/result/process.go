package result

import (
	"encoding/json"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/codemode"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/compress"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Meta describes post-processed tool response metrics for gate event logging.
type Meta struct {
	ResponseBytes int
	Compressed    bool
	SavedBytes    int
}

// Process applies code-mode outline (optional) then response compression (optional).
func Process(tool string, rawArgs json.RawMessage, result *mcp.CallToolResult) (*mcp.CallToolResult, Meta) {
	if result == nil {
		return nil, Meta{}
	}
	path := codemode.PathFromArgs(rawArgs)
	out, _ := codemode.MaybeTransform(tool, path, result)
	preCompress := out
	out, stats := compress.MaybeCompress(tool, out)
	out = maybeDedupe(tool, rawArgs, out)

	meta := Meta{ResponseBytes: resultJSONBytes(out)}
	if stats.Applied {
		meta.Compressed = true
		before := resultJSONBytes(preCompress)
		if before > meta.ResponseBytes {
			meta.SavedBytes = before - meta.ResponseBytes
		}
	}
	return out, meta
}

func resultJSONBytes(result *mcp.CallToolResult) int {
	if result == nil {
		return 0
	}
	b, err := json.Marshal(result)
	if err != nil {
		return 0
	}
	return len(b)
}
