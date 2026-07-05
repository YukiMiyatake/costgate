package shield

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"unicode"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var (
	ghTokenRe     = regexp.MustCompile(`\b(ghp_[A-Za-z0-9_]{20,})\b`)
	ghFineTokenRe = regexp.MustCompile(`\b(github_pat_[A-Za-z0-9_]{20,})\b`)
	awsKeyRe      = regexp.MustCompile(`\b(AKIA[0-9A-Z]{16})\b`)
	bearerRe      = regexp.MustCompile(`(?i)\bBearer\s+([A-Za-z0-9\-._~+/]+=*)\b`)
	jwtRe         = regexp.MustCompile(`\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b`)
	emailRe       = regexp.MustCompile(`\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b`)
	phoneRe       = regexp.MustCompile(`\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b`)
	pathRe        = regexp.MustCompile(`(?:^|[\s"'=(])(/(?:home|Users|tmp|var|etc|opt)[/\w.\-]+|~[/\\][\w.\-/\\]+)`)
	envValueRe    = regexp.MustCompile(`(?m)^([A-Z][A-Z0-9_]{1,64})=(.+)$`)
	connStringRe  = regexp.MustCompile(`(?i)\b(?:postgres|mysql|mongodb|redis)(?:\+[a-z]+)?://[^\s"'<>]+`)
	placeholderRe = regexp.MustCompile(PlaceholderPattern)
)

// Handler applies trust-aware redact/unredact around MCP tool calls.
type Handler struct {
	vault *Vault
}

// NewHandler creates a Shield handler when enabled; nil vault errors propagate.
func NewHandler() (*Handler, error) {
	if !Enabled() {
		return nil, nil
	}
	vault, err := NewVault()
	if err != nil {
		return nil, err
	}
	return &Handler{vault: vault}, nil
}

// DenyCall reports whether the backend trust level blocks tools/call.
func (h *Handler) DenyCall(backendName string) bool {
	if h == nil {
		return false
	}
	return DenyCalls(backendName)
}

// Mode returns the redact mode for a backend.
func (h *Handler) Mode(backendName string) Mode {
	if h == nil {
		return ModeOff
	}
	return ModeForBackend(backendName)
}

// UnredactArguments replaces vault placeholders in tool arguments before backend call.
func (h *Handler) UnredactArguments(raw json.RawMessage) json.RawMessage {
	if h == nil || len(raw) == 0 {
		return raw
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return raw
	}
	out := unredactValue(v, h.vault)
	b, err := json.Marshal(out)
	if err != nil {
		return raw
	}
	return b
}

// RedactResult redacts secrets in a tool result based on backend trust.
func (h *Handler) RedactResult(backendName string, result *mcp.CallToolResult) *mcp.CallToolResult {
	if h == nil || result == nil {
		return result
	}
	mode := ModeForBackend(backendName)
	if mode == ModeOff {
		return result
	}
	out := cloneResult(result)
	for i, item := range out.Content {
		text, ok := item.(*mcp.TextContent)
		if !ok {
			continue
		}
		out.Content[i] = &mcp.TextContent{Text: redactText(text.Text, mode, h.vault)}
	}
	return out
}

func cloneResult(result *mcp.CallToolResult) *mcp.CallToolResult {
	out := *result
	out.Content = append([]mcp.Content(nil), result.Content...)
	return &out
}

func redactText(text string, mode Mode, vault *Vault) string {
	if text == "" {
		return text
	}
	if looksLikeJSON(text) {
		var v any
		if err := json.Unmarshal([]byte(text), &v); err == nil {
			redacted := redactValue(v, mode, vault)
			if b, err := json.Marshal(redacted); err == nil {
				return string(b)
			}
		}
	}
	return redactString(text, mode, vault)
}

func looksLikeJSON(text string) bool {
	trimmed := strings.TrimSpace(text)
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")
}

func redactValue(v any, mode Mode, vault *Vault) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			keyLower := strings.ToLower(k)
			if mode >= ModeSecrets && isSensitiveKey(keyLower) {
				if s, ok := val.(string); ok && s != "" {
					out[k] = vault.Store(classifyKey(k), s)
					continue
				}
			}
			out[k] = redactValue(val, mode, vault)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = redactValue(val, mode, vault)
		}
		return out
	case string:
		return redactString(x, mode, vault)
	default:
		return v
	}
}

func unredactValue(v any, vault *Vault) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			out[k] = unredactValue(val, vault)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = unredactValue(val, vault)
		}
		return out
	case string:
		return unredactString(x, vault)
	default:
		return v
	}
}

func redactString(text string, mode Mode, vault *Vault) string {
	if text == "" {
		return text
	}
	if mode == ModeFull {
		if len(strings.TrimSpace(text)) <= 4 {
			return text
		}
		if placeholderRe.MatchString(text) {
			return text
		}
		return vault.Store("REDACTED", text)
	}

	out := text
	out = replaceAllWithVault(out, ghTokenRe, "GITHUB_PAT", vault, 1)
	out = replaceAllWithVault(out, ghFineTokenRe, "GITHUB_PAT", vault, 1)
	out = replaceAllWithVault(out, awsKeyRe, "AWS_KEY", vault, 1)
	out = replaceAllWithVault(out, bearerRe, "BEARER", vault, 1)
	out = replaceAllWithVault(out, jwtRe, "JWT", vault, 1)
	out = replaceAllWithVault(out, connStringRe, "CONN_STRING", vault, 0)

	if mode >= ModeAggressive {
		out = replaceAllWithVault(out, emailRe, "EMAIL", vault, 0)
		out = replaceAllWithVault(out, phoneRe, "PHONE", vault, 0)
		out = replaceAllWithVault(out, pathRe, "PATH", vault, 1)
		out = redactEnvLines(out, vault)
	}

	return out
}

func replaceAllWithVault(text string, re *regexp.Regexp, kind string, vault *Vault, submatch int) string {
	return re.ReplaceAllStringFunc(text, func(match string) string {
		secret := match
		if submatch > 0 {
			groups := re.FindStringSubmatch(match)
			if len(groups) > submatch {
				secret = groups[submatch]
			}
		}
		if secret == "" {
			return match
		}
		return strings.Replace(match, secret, vault.Store(kind, secret), 1)
	})
}

func redactEnvLines(text string, vault *Vault) string {
	return envValueRe.ReplaceAllStringFunc(text, func(line string) string {
		groups := envValueRe.FindStringSubmatch(line)
		if len(groups) < 3 {
			return line
		}
		key, val := groups[1], strings.TrimSpace(groups[2])
		if val == "" || strings.HasPrefix(val, placeholderPrefix) {
			return line
		}
		return key + "=" + vault.Store("ENV", val)
	})
}

func unredactString(text string, vault *Vault) string {
	return placeholderRe.ReplaceAllStringFunc(text, func(token string) string {
		groups := placeholderRe.FindStringSubmatch(token)
		if len(groups) < 3 {
			return token
		}
		id := groups[2]
		if val, ok := vault.Lookup(id); ok {
			return val
		}
		return token
	})
}

func isSensitiveKey(key string) bool {
	sensitive := []string{
		"token", "secret", "password", "passwd", "api_key", "apikey",
		"authorization", "auth", "credential", "private_key", "access_key",
	}
	for _, s := range sensitive {
		if strings.Contains(key, s) {
			return true
		}
	}
	return false
}

func classifyKey(key string) string {
	keyLower := strings.ToLower(key)
	switch {
	case strings.Contains(keyLower, "github"):
		return "GITHUB_PAT"
	case strings.Contains(keyLower, "aws"):
		return "AWS_KEY"
	case strings.Contains(keyLower, "password"):
		return "PASSWORD"
	default:
		return "SECRET"
	}
}

// DenyResult builds an MCP error result for untrusted backends.
func DenyResult(tool string) *mcp.CallToolResult {
	msg := fmt.Sprintf("[costgate-shield] tools/call denied for %q (trust=untrusted)", tool)
	log.Printf("[costgate-shield] deny tool=%s trust=untrusted", tool)
	return &mcp.CallToolResult{
		IsError: true,
		Content: []mcp.Content{&mcp.TextContent{Text: msg}},
	}
}

// LogStartup logs shield status when enabled.
func LogStartup(backendName string) {
	if !Enabled() {
		return
	}
	mode := ModeForBackend(backendName)
	trust := TrustLabel(backendName)
	log.Printf(
		"[costgate-shield] enabled backend=%s trust=%s mode=%s vault=%s",
		backendName, trust, ModeLabel(mode), VaultDir(),
	)
}

// LuhnValid checks credit card numbers (reserved for custom rules).
func LuhnValid(number string) bool {
	digits := make([]int, 0, len(number))
	for _, r := range number {
		if unicode.IsDigit(r) {
			digits = append(digits, int(r-'0'))
		}
	}
	if len(digits) < 13 || len(digits) > 19 {
		return false
	}
	sum := 0
	parity := len(digits) % 2
	for i, d := range digits {
		if i%2 == parity {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
	}
	return sum%10 == 0
}
