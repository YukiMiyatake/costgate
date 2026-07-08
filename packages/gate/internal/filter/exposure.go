package filter

import (
	"encoding/json"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ExposureMode controls how Tier B tools are added to tools/list.
type ExposureMode string

const (
	ExposureConservative ExposureMode = "conservative"
	ExposureAggressive   ExposureMode = "aggressive"
	ExposureBudget       ExposureMode = "budget"
	ExposurePermissive   ExposureMode = "permissive"

	defaultExposureMaxB        = 5
	defaultExposureTokenBudget = 4000
)

type scoredTool struct {
	tool  *mcp.Tool
	score int
	tier  Tier
	tokens int
}

// ResolveExposureMode reads COSTGATE_EXPOSURE_MODE (conservative | aggressive | budget).
func ResolveExposureMode() ExposureMode {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("COSTGATE_EXPOSURE_MODE"))) {
	case "aggressive":
		return ExposureAggressive
	case "budget":
		return ExposureBudget
	case "conservative":
		return ExposureConservative
	default:
		return ExposurePermissive
	}
}

// ExposureMaxTierB is the Tier B cap for aggressive mode.
func ExposureMaxTierB() int {
	v := strings.TrimSpace(os.Getenv("COSTGATE_EXPOSURE_MAX_B"))
	if v == "" {
		return defaultExposureMaxB
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return defaultExposureMaxB
	}
	return n
}

// ExposureTokenBudget is the tools/list token cap for budget mode (0 = unlimited).
func ExposureTokenBudget() int {
	v := strings.TrimSpace(os.Getenv("COSTGATE_EXPOSURE_TOKEN_BUDGET"))
	if v == "" {
		return defaultExposureTokenBudget
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return defaultExposureTokenBudget
	}
	return n
}

// IntentRelevanceScore ranks Tier B candidates (higher = better match).
func IntentRelevanceScore(intent string, tool *mcp.Tool) int {
	intent = strings.TrimSpace(intent)
	if intent == "" || tool == nil {
		return 0
	}
	score := 0
	name := strings.ToLower(tool.Name)
	desc := strings.ToLower(tool.Description)
	for _, word := range strings.Fields(strings.ToLower(intent)) {
		if len(word) < 3 {
			continue
		}
		if strings.Contains(name, word) {
			score += 10
			if strings.HasPrefix(name, word) || strings.HasSuffix(name, word) {
				score += 5
			}
		} else if strings.Contains(desc, word) {
			score += 4
		}
	}
	return score
}

func estimateToolListTokens(tool *mcp.Tool) int {
	if tool == nil {
		return 0
	}
	b, err := json.Marshal(tool)
	if err != nil {
		return 0
	}
	n := len(b)
	return (n + 3) / 4
}

func selectExposedPermissive(tools []*mcp.Tool, tiers map[string]Tier, intent string) []*mcp.Tool {
	var exposed []*mcp.Tool
	for _, tool := range tools {
		if tool == nil {
			continue
		}
		switch tiers[tool.Name] {
		case TierA, TierB:
			exposed = append(exposed, tool)
		case TierC:
			if MatchIntent(intent, tool) {
				exposed = append(exposed, tool)
			}
		}
	}
	return exposed
}

func selectExposedConservative(tools []*mcp.Tool, tiers map[string]Tier, intent string) []*mcp.Tool {
	var exposed []*mcp.Tool
	for _, tool := range tools {
		if tool == nil {
			continue
		}
		switch tiers[tool.Name] {
		case TierA:
			exposed = append(exposed, tool)
		case TierB:
			if MatchIntent(intent, tool) {
				exposed = append(exposed, tool)
			}
		}
	}
	return exposed
}

func selectExposedAggressive(tools []*mcp.Tool, tiers map[string]Tier, intent string, maxB int) []*mcp.Tool {
	var exposed []*mcp.Tool
	var tierB []scoredTool
	for _, tool := range tools {
		if tool == nil {
			continue
		}
		switch tiers[tool.Name] {
		case TierA:
			exposed = append(exposed, tool)
		case TierB:
			if MatchIntent(intent, tool) {
				tierB = append(tierB, scoredTool{
					tool:  tool,
					score: IntentRelevanceScore(intent, tool),
					tier:  TierB,
				})
			}
		}
	}
	sort.Slice(tierB, func(i, j int) bool {
		if tierB[i].score != tierB[j].score {
			return tierB[i].score > tierB[j].score
		}
		return tierB[i].tool.Name < tierB[j].tool.Name
	})
	if maxB > 0 && len(tierB) > maxB {
		tierB = tierB[:maxB]
	}
	for _, st := range tierB {
		exposed = append(exposed, st.tool)
	}
	return exposed
}

func selectExposedBudget(tools []*mcp.Tool, tiers map[string]Tier, intent string, budget int) []*mcp.Tool {
	if budget <= 0 {
		return selectExposedConservative(tools, tiers, intent)
	}

	var tierA []*mcp.Tool
	var tierB []scoredTool
	used := 0

	for _, tool := range tools {
		if tool == nil {
			continue
		}
		switch tiers[tool.Name] {
		case TierA:
			tok := estimateToolListTokens(tool)
			if used+tok > budget && len(tierA) > 0 {
				continue
			}
			tierA = append(tierA, tool)
			used += tok
		case TierB:
			if MatchIntent(intent, tool) {
				tierB = append(tierB, scoredTool{
					tool:   tool,
					score:  IntentRelevanceScore(intent, tool),
					tokens: estimateToolListTokens(tool),
				})
			}
		}
	}

	sort.Slice(tierB, func(i, j int) bool {
		if tierB[i].score != tierB[j].score {
			return tierB[i].score > tierB[j].score
		}
		return tierB[i].tool.Name < tierB[j].tool.Name
	})

	exposed := append([]*mcp.Tool{}, tierA...)
	for _, st := range tierB {
		if st.tokens > 0 && used+st.tokens > budget {
			continue
		}
		exposed = append(exposed, st.tool)
		used += st.tokens
	}
	return exposed
}

// SelectExposed picks backend tools to register in tools/list.
func SelectExposed(tools []*mcp.Tool, tiers map[string]Tier, intent string) []*mcp.Tool {
	var exposed []*mcp.Tool
	switch ResolveExposureMode() {
	case ExposureAggressive:
		exposed = selectExposedAggressive(tools, tiers, intent, ExposureMaxTierB())
	case ExposureBudget:
		exposed = selectExposedBudget(tools, tiers, intent, ExposureTokenBudget())
	case ExposureConservative:
		exposed = selectExposedConservative(tools, tiers, intent)
	default:
		exposed = selectExposedPermissive(tools, tiers, intent)
	}
	return slimExposedTools(exposed)
}
