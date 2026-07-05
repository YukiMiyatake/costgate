package shield

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const placeholderPrefix = "[[CG:"
const placeholderSuffix = "]]"

// VaultEntry stores one redacted secret with TTL metadata.
type VaultEntry struct {
	Kind  string `json:"kind"`
	Value string `json:"value"`
	TS    int64  `json:"ts"`
}

type vaultFile struct {
	Entries map[string]VaultEntry `json:"entries"`
}

// Vault persists placeholder → original mappings for unredact round-trips.
type Vault struct {
	dir       string
	sessionID string
	ttl       time.Duration
	mu        sync.Mutex
	entries   map[string]VaultEntry
	dirty     bool
}

// NewVault opens or creates a session-scoped vault file.
func NewVault() (*Vault, error) {
	dir := VaultDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("vault mkdir: %w", err)
	}
	v := &Vault{
		dir:       dir,
		sessionID: SessionID(),
		ttl:       VaultTTL(),
		entries:   map[string]VaultEntry{},
	}
	if err := v.load(); err != nil {
		return nil, err
	}
	return v, nil
}

func (v *Vault) filePath() string {
	safe := strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' {
			return '_'
		}
		return r
	}, v.sessionID)
	return filepath.Join(v.dir, safe+".json")
}

func (v *Vault) load() error {
	data, err := os.ReadFile(v.filePath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("vault read: %w", err)
	}
	var file vaultFile
	if err := json.Unmarshal(data, &file); err != nil {
		return fmt.Errorf("vault parse: %w", err)
	}
	if file.Entries == nil {
		return nil
	}
	now := time.Now().Unix()
	for id, entry := range file.Entries {
		if v.ttl > 0 && now-entry.TS > int64(v.ttl.Seconds()) {
			continue
		}
		v.entries[id] = entry
	}
	return nil
}

func (v *Vault) save() error {
	if !v.dirty {
		return nil
	}
	file := vaultFile{Entries: v.entries}
	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := v.filePath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, v.filePath())
}

// Store saves a secret and returns its placeholder token.
func (v *Vault) Store(kind, value string) string {
	v.mu.Lock()
	defer v.mu.Unlock()

	id := shortID(kind, value)
	if existing, ok := v.entries[id]; ok && existing.Value == value {
		return formatPlaceholder(kind, id)
	}

	v.entries[id] = VaultEntry{
		Kind:  kind,
		Value: value,
		TS:    time.Now().Unix(),
	}
	v.dirty = true
	_ = v.save()
	return formatPlaceholder(kind, id)
}

// Lookup resolves a placeholder id to the original value.
func (v *Vault) Lookup(id string) (string, bool) {
	v.mu.Lock()
	defer v.mu.Unlock()
	entry, ok := v.entries[id]
	if !ok {
		return "", false
	}
	if v.ttl > 0 && time.Now().Unix()-entry.TS > int64(v.ttl.Seconds()) {
		delete(v.entries, id)
		v.dirty = true
		_ = v.save()
		return "", false
	}
	return entry.Value, true
}

func shortID(kind, value string) string {
	sum := sha256.Sum256([]byte(kind + "\x00" + value))
	return hex.EncodeToString(sum[:])[:4]
}

func formatPlaceholder(kind, id string) string {
	return placeholderPrefix + kind + ":" + id + placeholderSuffix
}

// PlaceholderPattern matches [[CG:KIND:id]] tokens.
const PlaceholderPattern = `\[\[CG:([A-Z0-9_]+):([a-f0-9]{4})\]\]`
