// Package metrics records usage stats for tool filter tiers.
package metrics

// Store persists tool call statistics (implementation pending).
type Store struct{}

// NewStore creates a metrics store.
func NewStore() *Store {
	return &Store{}
}
