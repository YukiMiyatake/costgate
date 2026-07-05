package gatelog

import (
	"encoding/json"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// EstimateListTokens sums token estimates for exposed tool definitions.
func EstimateListTokens(tools []*mcp.Tool) int {
	total := 0
	for _, tool := range tools {
		if tool == nil {
			continue
		}
		b, err := json.Marshal(tool)
		if err != nil {
			continue
		}
		total += BytesToTokens(len(b))
	}
	return total
}
