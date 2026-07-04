// CostGate Gateway MCP — entry point
package main

import (
	"fmt"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/proxy"
)

func main() {
	srv := proxy.New()
	_ = srv
	fmt.Println("costgate-gate v0.1.0 — gateway implementation coming soon")
}
