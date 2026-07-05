package filter

// Tier classifies how a backend tool is exposed in tools/list.
type Tier int

const (
	TierA Tier = iota // always exposed
	TierB             // exposed when intent keywords match
	TierC             // hidden; discover_tools / invoke_tool only
	TierHidden        // force hidden; excluded from discover_tools matches
)

func (t Tier) String() string {
	switch t {
	case TierA:
		return "A"
	case TierB:
		return "B"
	case TierHidden:
		return "hidden"
	default:
		return "C"
	}
}
