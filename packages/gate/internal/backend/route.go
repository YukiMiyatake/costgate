package backend

import (
	"fmt"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/catalog"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ResolveRoute maps a tool name (qualified or unqualified) to a backend session.
func ResolveRoute(registry *Registry, name string) (*mcp.ClientSession, string, string, error) {
	if registry == nil {
		return nil, "", "", fmt.Errorf("no backends configured")
	}
	if backendName, rawTool, ok := catalog.SplitQualified(name); ok {
		session, ok := registry.Session(backendName)
		if !ok {
			return nil, "", "", fmt.Errorf("unknown backend %q", backendName)
		}
		return session, backendName, rawTool, nil
	}
	if registry.Single() {
		backendName := registry.Names()[0]
		session, ok := registry.Session(backendName)
		if !ok {
			return nil, "", "", fmt.Errorf("backend %q not connected", backendName)
		}
		return session, backendName, name, nil
	}
	return nil, "", "", fmt.Errorf("ambiguous tool %q: use backend/tool form", name)
}
