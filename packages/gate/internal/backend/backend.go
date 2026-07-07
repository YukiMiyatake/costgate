package backend

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Connect starts the backend MCP server and returns a client session.
func Connect(ctx context.Context, name string, cfg config.BackendConfig) (*mcp.ClientSession, error) {
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("backend %s: %w", name, err)
	}

	client := mcp.NewClient(&mcp.Implementation{
		Name:    "costgate-gate",
		Version: "0.1.0",
	}, nil)

	var transport mcp.Transport
	if strings.TrimSpace(cfg.URL) != "" {
		transport = &mcp.StreamableClientTransport{
			Endpoint:   cfg.URL,
			HTTPClient: httpClientForBackend(cfg),
			MaxRetries: defaultHTTPMaxRetries,
		}
	} else {
		cmd := exec.Command(cfg.Command, cfg.Args...)
		if cfg.Cwd != "" {
			cmd.Dir = cfg.Cwd
		}
		cmd.Env = os.Environ()
		for k, v := range cfg.Env {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
		}
		cmd.Stderr = os.Stderr
		transport = &mcp.CommandTransport{Command: cmd}
	}

	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return nil, fmt.Errorf("connect backend %s: %w", name, err)
	}
	kind := "stdio"
	if strings.TrimSpace(cfg.URL) != "" {
		kind = "url"
	}
	log.Printf("[costgate-gate] backend connected: %s (%s)", name, kind)
	return session, nil
}
