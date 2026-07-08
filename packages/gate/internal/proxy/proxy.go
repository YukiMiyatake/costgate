package proxy

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/gatelog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/overrides"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/version"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// GateModeLabel returns the active gate mode for logging.
func GateModeLabel() string {
	return gateMode()
}

// Run starts the Gate MCP server. Mode is filter (default) or transparent.
func Run(ctx context.Context, registry *backend.Registry) error {
	if gateMode() == "transparent" {
		return runTransparent(ctx, registry)
	}
	return runFiltered(ctx, registry)
}

func gateMode() string {
	if m := os.Getenv("COSTGATE_GATE_MODE"); m != "" {
		return m
	}
	return "transparent"
}

func intentKeywords() string {
	return os.Getenv("COSTGATE_INTENT")
}

func runTransparent(ctx context.Context, registry *backend.Registry) error {
	fcs, err := newForwardContexts(registry)
	if err != nil {
		return fmt.Errorf("shield init: %w", err)
	}
	cat, err := catalog.LoadMulti(ctx, registry)
	if err != nil {
		return err
	}
	server := newServer(registry.String())
	registerBackendTools(server, cat.Tools, registry, fcs, nil)
	log.Printf("[costgate-gate] transparent mode: %d tools from [%s]", len(cat.Tools), registry.String())
	return serve(ctx, server)
}

func runFiltered(ctx context.Context, registry *backend.Registry) error {
	cat, err := catalog.LoadMulti(ctx, registry)
	if err != nil {
		return err
	}

	store, err := usage.Load()
	if err != nil {
		return fmt.Errorf("load usage store: %w", err)
	}
	defer func() {
		if err := store.Flush(); err != nil {
			log.Printf("[costgate-gate] usage flush: %v", err)
		}
	}()
	if err := store.ImportProbeLogs(""); err != nil {
		log.Printf("[costgate-gate] probe log import: %v", err)
	}

	tiers := filter.Classify(cat.Tools, store)
	for _, backendName := range registry.Names() {
		rules, err := catalog.LoadTierRules(backendName)
		if err != nil {
			return fmt.Errorf("load tier catalog: %w", err)
		}
		if rules == nil {
			continue
		}
		if registry.Single() {
			tiers = rules.Apply(tiers)
		} else {
			tiers = rules.ApplyForBackend(tiers, backendName)
		}
		log.Printf("[costgate-gate] tier catalog: %s (%d overrides)", backendName, len(rules.Overrides))
	}
	classifiedTiers := filter.CopyTiers(tiers)
	effectiveTiers := filter.CopyTiers(tiers)
	if ov, err := overrides.Load(); err != nil {
		return fmt.Errorf("load tool overrides: %w", err)
	} else if ov != nil && len(ov.Tools) > 0 {
		ov.ApplyInPlace(classifiedTiers, effectiveTiers)
		log.Printf("[costgate-gate] tool overrides: %d entries", len(ov.Tools))
	}
	fcs, err := newForwardContexts(registry)
	if err != nil {
		return fmt.Errorf("shield init: %w", err)
	}
	server := newServer(registry.String())
	rt := newFilterRuntime(server, cat, classifiedTiers, effectiveTiers, registry, store, intentKeywords(), fcs)
	rt.logStartup()
	return serve(ctx, server)
}

func newServer(backend string) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "costgate-gate",
		Version: version.Version,
	}, nil)
	gatelog.InstallToolsListLogging(server, backend)
	return server
}

func registerBackendTools(server *mcp.Server, tools []*mcp.Tool, registry *backend.Registry, fcs map[string]*forwardContext, onCall func(string)) {
	for _, tool := range tools {
		tool := tool
		if tool.InputSchema == nil {
			log.Printf("[costgate-gate] skip tool %q: missing input schema", tool.Name)
			continue
		}
		server.AddTool(tool, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			result, err := callBackendFromRequest(ctx, registry, req, fcs)
			if err == nil && onCall != nil {
				onCall(req.Params.Name)
			}
			return result, err
		})
	}
}

func serve(ctx context.Context, server *mcp.Server) error {
	log.Printf("[costgate-gate] proxy listening on stdio")
	if err := server.Run(ctx, &mcp.StdioTransport{}); err != nil {
		return fmt.Errorf("server run: %w", err)
	}
	return nil
}
