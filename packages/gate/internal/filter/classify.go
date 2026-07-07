package filter

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	defaultTierARatio = 0.20
	defaultTierBRatio = 0.30

	scoreWeightCallCount = 0.5
	scoreWeightRecent7d  = 0.3
	scoreWeightRecent30d = 0.15
	scoreWeightHasUsage  = 0.2
)

// bootstrapPrefixes boost tools with no usage history into Tier A candidates.
var bootstrapPrefixes = []string{
	"search_",
	"get_",
	"list_",
	"create_issue",
	"get_file_contents",
}

// Classify assigns Tier A/B/C from usage stats and tool metadata.
func Classify(tools []*mcp.Tool, store *usage.Store) map[string]Tier {
	if len(tools) == 0 {
		return map[string]Tier{}
	}

	type scored struct {
		name  string
		score float64
	}

	scores := make([]scored, 0, len(tools))
	hasUsage := store != nil && len(store.Tools) > 0

	for _, tool := range tools {
		if tool == nil {
			continue
		}
		var score float64
		if hasUsage {
			st := store.Tools[tool.Name]
			score = float64(st.CallCount) * scoreWeightCallCount
			if !st.LastUsed.IsZero() {
				days := time.Since(st.LastUsed).Hours() / 24
				if days <= 7 {
					score += scoreWeightRecent7d
				} else if days <= 30 {
					score += scoreWeightRecent30d
				}
			}
			if st.CallCount > 0 {
				score += scoreWeightHasUsage
			}
		}
		if score == 0 {
			score = bootstrapScore(tool.Name)
		}
		scores = append(scores, scored{name: tool.Name, score: score})
	}

	sort.Slice(scores, func(i, j int) bool {
		if scores[i].score == scores[j].score {
			return scores[i].name < scores[j].name
		}
		return scores[i].score > scores[j].score
	})

	tierA := int(math.Max(2, math.Ceil(float64(len(scores))*defaultTierARatio)))
	tierB := int(math.Ceil(float64(len(scores)) * defaultTierBRatio))

	out := make(map[string]Tier, len(scores))
	for i, s := range scores {
		switch {
		case i < tierA:
			out[s.name] = TierA
		case i < tierA+tierB:
			out[s.name] = TierB
		default:
			out[s.name] = TierC
		}
	}
	return out
}

func bootstrapScore(name string) float64 {
	lower := strings.ToLower(name)
	for i, p := range bootstrapPrefixes {
		if strings.HasPrefix(lower, p) || lower == p {
			return 1.0 - float64(i)*0.05
		}
	}
	return 0.01
}

// MatchIntent returns true when intent keywords match the tool name or description.
func MatchIntent(intent string, tool *mcp.Tool) bool {
	intent = strings.TrimSpace(intent)
	if intent == "" || tool == nil {
		return false
	}
	q := strings.ToLower(intent)
	name := strings.ToLower(tool.Name)
	desc := strings.ToLower(tool.Description)
	for _, word := range strings.Fields(q) {
		if len(word) < 3 {
			continue
		}
		if strings.Contains(name, word) || strings.Contains(desc, word) {
			return true
		}
	}
	return false
}

// CopyTiers returns a shallow copy of a tier map.
func CopyTiers(in map[string]Tier) map[string]Tier {
	out := make(map[string]Tier, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

// CountTiers returns how many tools fall in each tier (hidden counted separately).
func CountTiers(tiers map[string]Tier) (a, b, c, hidden int) {
	for _, t := range tiers {
		switch t {
		case TierA:
			a++
		case TierB:
			b++
		case TierHidden:
			hidden++
		default:
			c++
		}
	}
	return
}
