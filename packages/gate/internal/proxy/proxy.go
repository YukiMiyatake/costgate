package proxy

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/filter"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/version"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// GateModeLabel returns the active gate mode for logging.
func GateModeLabel() string {
	return gateMode()
}

// Run starts the Gate MCP server. Mode is filter (default) or transparent.
func Run(ctx context.Context, backend *mcp.ClientSession, backendName string) error {
	if gateMode() == "transparent" {
		return runTransparent(ctx, backend, backendName)
	}
	return runFiltered(ctx, backend, backendName)
}

func gateMode() string {
	if m := os.Getenv("COSTGATE_GATE_MODE"); m != "" {
		return m
	}
	return "filter"
}

func intentKeywords() string {
	return os.Getenv("COSTGATE_INTENT")
}

func runTransparent(ctx context.Context, backend *mcp.ClientSession, backendName string) error {
	cat, err := catalog.Load(ctx, backend, backendName)
	if err != nil {
		return err
	}
	server := newServer()
	registerBackendTools(server, cat.Tools, backend, nil)
	log.Printf("[costgate-gate] transparent mode: %d tools from %s", len(cat.Tools), backendName)
	return serve(ctx, server)
}

func runFiltered(ctx context.Context, backend *mcp.ClientSession, backendName string) error {
	cat, err := catalog.Load(ctx, backend, backendName)
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
	if rules, err := catalog.LoadTierRules(backendName); err != nil {
		return fmt.Errorf("load tier catalog: %w", err)
	} else if rules != nil {
		tiers = rules.Apply(tiers)
		log.Printf("[costgate-gate] tier catalog: %s (%d overrides)", backendName, len(rules.Overrides))
	}
	server := newServer()
	rt := newFilterRuntime(server, cat, tiers, backend, store, intentKeywords())
	rt.logStartup()
	return serve(ctx, server)
}

func newServer() *mcp.Server {
	return mcp.NewServer(&mcp.Implementation{
		Name:    "costgate-gate",
		Version: version.Version,
	}, nil)
}

func registerBackendTools(server *mcp.Server, tools []*mcp.Tool, backend *mcp.ClientSession, onCall func(string)) {
	for _, tool := range tools {
		tool := tool
		if tool.InputSchema == nil {
			log.Printf("[costgate-gate] skip tool %q: missing input schema", tool.Name)
			continue
		}
		server.AddTool(tool, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			result, err := callBackendFromRequest(ctx, backend, req)
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
