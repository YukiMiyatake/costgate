// Package proxy implements stdio MCP forwarding and tool filtering.
package proxy

// Server is the Gateway MCP proxy (implementation pending).
type Server struct{}

// New creates a proxy server.
func New() *Server {
	return &Server{}
}
