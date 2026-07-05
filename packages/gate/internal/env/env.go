package env

import (
	"os"
	"strings"
)

// Bool parses COSTGATE-style boolean env vars (0/false/no/off → false).
func Bool(key string, defaultVal bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return defaultVal
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}
