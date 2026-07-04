package backend

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Connect starts the backend MCP server and returns a client session.
func Connect(ctx context.Context, name string, cfg config.BackendConfig) (*mcp.ClientSession, error) {
	cmd := exec.Command(cfg.Command, cfg.Args...)
	if cfg.Cwd != "" {
		cmd.Dir = cfg.Cwd
	}
	cmd.Env = os.Environ()
	for k, v := range cfg.Env {
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Stderr = os.Stderr

	client := mcp.NewClient(&mcp.Implementation{
		Name:    "costgate-gate",
		Version: "0.1.0",
	}, nil)

	transport := &mcp.CommandTransport{Command: cmd}
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return nil, fmt.Errorf("connect backend %s: %w", name, err)
	}
	log.Printf("[costgate-gate] backend connected: %s", name)
	return session, nil
}
