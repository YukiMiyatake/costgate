// CostGate Gateway MCP — transparent proxy MVP
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/proxy"
)

func main() {
	log.SetOutput(os.Stderr)
	log.SetFlags(0)

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[costgate-gate] %v", err)
	}

	name, backendCfg, err := config.PrimaryBackend(cfg)
	if err != nil {
		log.Fatalf("[costgate-gate] %v", err)
	}

	configPath := config.ResolveConfigPath()
	log.Printf("[costgate-gate] v0.1.0 backend=%s config=%s", name, configPath)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	session, err := backend.Connect(ctx, name, backendCfg)
	if err != nil {
		log.Fatalf("[costgate-gate] %v", err)
	}
	defer session.Close()

	if err := proxy.Run(ctx, session, name); err != nil {
		log.Fatalf("[costgate-gate] %v", err)
	}
}
