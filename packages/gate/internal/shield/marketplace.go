package shield

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type marketplaceTemplate struct {
	ID         string `json:"id"`
	BackendKey string `json:"backend_key"`
	Official   bool   `json:"official"`
}

var (
	marketplaceMu     sync.Mutex
	marketplaceLoaded bool
	officialByKey     map[string]bool
)

// MarketplaceDir returns COSTGATE_MARKETPLACE_DIR when set.
func MarketplaceDir() string {
	return os.Getenv("COSTGATE_MARKETPLACE_DIR")
}

func loadMarketplaceOfficialLocked() {
	officialByKey = make(map[string]bool)
	dir := MarketplaceDir()
	if dir == "" {
		marketplaceLoaded = true
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		marketplaceLoaded = true
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var template marketplaceTemplate
		if err := json.Unmarshal(data, &template); err != nil {
			continue
		}
		if !template.Official {
			continue
		}
		if template.ID != "" {
			officialByKey[template.ID] = true
		}
		if template.BackendKey != "" {
			officialByKey[template.BackendKey] = true
		}
	}
	marketplaceLoaded = true
}

// IsOfficialMarketplace reports whether a backend key is an official Marketplace template.
func IsOfficialMarketplace(name string) bool {
	if name == "" {
		return false
	}
	marketplaceMu.Lock()
	if !marketplaceLoaded {
		loadMarketplaceOfficialLocked()
	}
	ok := officialByKey[name]
	marketplaceMu.Unlock()
	return ok
}
