package backend

import (
	"context"
	"testing"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
)

func TestReconnectIfIdleSkipsFreshURLBackend(t *testing.T) {
	r := &Registry{
		configs: map[string]config.BackendConfig{
			"aieph": {URL: "https://example.test/mcp"},
		},
		lastCallAt: map[string]time.Time{
			"aieph": time.Now(),
		},
	}
	if err := r.ReconnectIfIdle(context.Background(), "aieph"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReconnectIfIdleSkipsStdioBackend(t *testing.T) {
	r := &Registry{
		configs: map[string]config.BackendConfig{
			"serena": {Command: "serena"},
		},
		lastCallAt: map[string]time.Time{
			"serena": time.Now().Add(-10 * time.Minute),
		},
	}
	if err := r.ReconnectIfIdle(context.Background(), "serena"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReconnectIfIdleRequiresPriorUse(t *testing.T) {
	r := &Registry{
		configs: map[string]config.BackendConfig{
			"aieph": {URL: "https://example.test/mcp"},
		},
	}
	if err := r.ReconnectIfIdle(context.Background(), "aieph"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
