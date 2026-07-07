package backend

import (
	"testing"
)

func TestIsRetryableMCPError(t *testing.T) {
	cases := []struct {
		err  string
		want bool
	}{
		{"standalone SSE stream: exceeded 5 retries without progress", true},
		{"connection closed", true},
		{"unknown tool", false},
		{"", false},
	}
	for _, tc := range cases {
		got := IsRetryableMCPError(stringsToErr(tc.err))
		if got != tc.want {
			t.Fatalf("%q => %v, want %v", tc.err, got, tc.want)
		}
	}
}

func stringsToErr(s string) error {
	if s == "" {
		return nil
	}
	return &simpleErr{s}
}

type simpleErr struct{ s string }

func (e *simpleErr) Error() string { return e.s }
