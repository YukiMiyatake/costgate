// CostGate Gateway MCP — transparent proxy MVP
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/proxy"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/version"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/workspace"
)

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-version") {
		fmt.Printf("costgate-gate %s (%s)\n", version.Version, version.Commit)
		return
	}

	log.SetOutput(os.Stderr)
	log.SetFlags(0)

	workspace.RegisterFromEnv()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[costgate-gate] %v", err)
	}

	name, backendCfg, err := config.PrimaryBackend(cfg)
	if err != nil {
		log.Fatalf("[costgate-gate] %v", err)
	}

	configPath := config.ResolveConfigPath()
	log.Printf("[costgate-gate] v%s backend=%s config=%s mode=%s", version.Version, name, configPath, proxy.GateModeLabel())

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
