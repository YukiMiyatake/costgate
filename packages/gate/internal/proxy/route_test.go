package proxy

import (
	"testing"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/backend"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestResolveRouteSingle(t *testing.T) {
	reg := testRegistry(t, map[string]*mcp.ClientSession{"mock": {}})
	session, backendName, rawTool, err := backend.ResolveRoute(reg, "echo")
	if err != nil {
		t.Fatal(err)
	}
	if session == nil || backendName != "mock" || rawTool != "echo" {
		t.Errorf("got backend=%q tool=%q", backendName, rawTool)
	}
}

func TestResolveRouteQualified(t *testing.T) {
	reg := testRegistry(t, map[string]*mcp.ClientSession{
		"github":     {},
		"filesystem": {},
	})
	_, backendName, rawTool, err := backend.ResolveRoute(reg, "filesystem/read_file")
	if err != nil {
		t.Fatal(err)
	}
	if backendName != "filesystem" || rawTool != "read_file" {
		t.Errorf("got backend=%q tool=%q", backendName, rawTool)
	}
}

func TestResolveRouteMultiUnqualified(t *testing.T) {
	reg := testRegistry(t, map[string]*mcp.ClientSession{
		"github":     {},
		"filesystem": {},
	})
	_, _, _, err := backend.ResolveRoute(reg, "echo")
	if err == nil {
		t.Fatal("expected error for unqualified name with multiple backends")
	}
}

func testRegistry(t *testing.T, sessions map[string]*mcp.ClientSession) *backend.Registry {
	t.Helper()
	names := make([]string, 0, len(sessions))
	for name := range sessions {
		names = append(names, name)
	}
	reg, err := backend.NewRegistryForTest(names, sessions)
	if err != nil {
		t.Fatalf("NewRegistryForTest: %v", err)
	}
	return reg
}
