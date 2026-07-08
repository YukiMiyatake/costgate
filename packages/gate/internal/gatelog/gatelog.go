package gatelog

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/env"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/usage"
	"github.com/YukiMiyatake/costgate/packages/gate/internal/workspace"
)

// Logger appends gate_event rows to daily JSONL files.
type Logger struct {
	enabled bool
	dir     string

	mu   sync.Mutex
	date string
	file *os.File
}

var defaultLogger = New()

// New builds a logger from COSTGATE_GATE_LOG and COSTGATE_GATE_LOG_DIR.
func New() *Logger {
	return &Logger{
		enabled: env.Bool("COSTGATE_GATE_LOG", true),
		dir:     resolveDir(),
	}
}

func resolveDir() string {
	if d := os.Getenv("COSTGATE_GATE_LOG_DIR"); d != "" {
		return d
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".costgate/logs"
	}
	return filepath.Join(home, ".costgate", "logs")
}

// Enabled reports whether gate event logging is active.
func Enabled() bool {
	return defaultLogger.enabled
}

// LogDir returns the configured log directory.
func LogDir() string {
	return defaultLogger.dir
}

// LogToolsList records a tools/list exposure snapshot.
func LogToolsList(backend string, toolsExposed, tokensEst int) {
	defaultLogger.logToolsList(backend, toolsExposed, tokensEst)
}

// LogToolCall records a backend tool invocation.
func LogToolCall(tool string, responseBytes int, compressed bool, savedBytes int) {
	defaultLogger.logToolCall(tool, responseBytes, compressed, savedBytes)
}

// LogSettingsReload records a gate-settings hot-reload.
func LogSettingsReload(configGeneration string) {
	defaultLogger.append(map[string]any{
		"event":              "settings_reload",
		"config_generation": configGeneration,
	})
}

// LogOverridesReload records a tool-overrides hot-reload.
func LogOverridesReload(overridesGeneration string) {
	defaultLogger.append(map[string]any{
		"event":                "overrides_reload",
		"overrides_generation": overridesGeneration,
	})
}

// LogToolCallError records a failed backend tool invocation.
func LogToolCallError(tool string, err error) {
	defaultLogger.logToolCallError(tool, err)
}

func (l *Logger) logToolsList(backend string, toolsExposed, tokensEst int) {
	l.append(map[string]any{
		"event":          "tools_list",
		"backend":        backend,
		"tools_exposed":  toolsExposed,
		"tokens_est":     tokensEst,
	})
}

func (l *Logger) logToolCall(tool string, responseBytes int, compressed bool, savedBytes int) {
	row := map[string]any{
		"event":          "tool_call",
		"tool":           tool,
		"response_bytes": responseBytes,
		"compressed":     compressed,
		"ok":             true,
	}
	if savedBytes > 0 {
		row["saved_bytes"] = savedBytes
	}
	if root := workspace.ResolveProjectRoot(); root != "" {
		row["project_root"] = root
	}
	l.append(row)
}

func (l *Logger) logToolCallError(tool string, err error) {
	msg := ""
	if err != nil {
		msg = err.Error()
		if len(msg) > 200 {
			msg = msg[:200]
		}
	}
	row := map[string]any{
		"event": "tool_call",
		"tool":  tool,
		"ok":    false,
		"error": msg,
	}
	if root := workspace.ResolveProjectRoot(); root != "" {
		row["project_root"] = root
	}
	l.append(row)
}

func (l *Logger) append(row map[string]any) {
	if !l.enabled {
		return
	}
	mergeCorrelation(row)
	row["type"] = "gate_event"
	row["ts"] = time.Now().UTC().Format(time.RFC3339)

	l.mu.Lock()
	defer l.mu.Unlock()

	date := time.Now().UTC().Format("2006-01-02")
	if err := l.ensureFile(date); err != nil {
		log.Printf("[costgate-gate] gate log: %v", err)
		return
	}
	b, err := json.Marshal(row)
	if err != nil {
		log.Printf("[costgate-gate] gate log marshal: %v", err)
		return
	}
	if _, err := l.file.Write(append(b, '\n')); err != nil {
		log.Printf("[costgate-gate] gate log write: %v", err)
	}
}

func (l *Logger) ensureFile(date string) error {
	if l.file != nil && l.date == date {
		return nil
	}
	if l.file != nil {
		_ = l.file.Close()
		l.file = nil
	}
	if err := os.MkdirAll(l.dir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(l.dir, "gate-"+date+".jsonl")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	l.file = f
	l.date = date
	return nil
}

// BytesToTokens approximates tokens from byte size (matches @costgate/probe).
func BytesToTokens(bytes int) int {
	if bytes <= 0 {
		return 0
	}
	return (bytes + 3) / 4
}

func mergeCorrelation(row map[string]any) {
	root := ""
	if v, ok := row["project_root"].(string); ok {
		root = v
	}
	if root == "" {
		root = workspace.ResolveProjectRoot()
	}
	for k, v := range usage.LogCorrelationFields("", root) {
		row[k] = v
	}
}
