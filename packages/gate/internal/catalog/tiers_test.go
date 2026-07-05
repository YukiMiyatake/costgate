package catalog

import (
	"testing"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
)

func TestLoadTierRulesMock(t *testing.T) {
	rules, err := LoadTierRules("mock")
	if err != nil {
		t.Fatal(err)
	}
	if rules == nil {
		t.Fatal("expected mock tier rules")
	}
	if rules.Backend != "mock" {
		t.Fatalf("backend=%q", rules.Backend)
	}
	if rules.Overrides["fork_repository"] != "C" {
		t.Fatalf("fork tier=%q", rules.Overrides["fork_repository"])
	}
}

func TestApplyTierRules(t *testing.T) {
	rules := &TierRules{
		Overrides: map[string]string{
			"fork_repository": "A",
			"echo":            "C",
		},
	}
	classified := map[string]filter.Tier{
		"fork_repository": filter.TierC,
		"echo":            filter.TierB,
		"get_file_contents": filter.TierA,
	}
	out := rules.Apply(classified)
	if out["fork_repository"] != filter.TierA {
		t.Error("fork should be promoted to A")
	}
	if out["echo"] != filter.TierC {
		t.Error("echo should be C")
	}
	if out["get_file_contents"] != filter.TierA {
		t.Error("unchanged tier A")
	}
}

func TestLoadTierRulesUnknown(t *testing.T) {
	rules, err := LoadTierRules("unknown-backend")
	if err != nil {
		t.Fatal(err)
	}
	if rules != nil {
		t.Fatal("expected nil for unknown backend")
	}
}
