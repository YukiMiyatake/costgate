package gatesettings

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// Settings mirrors ~/.costgate/gate-settings.json (Dashboard + launcher).
type Settings struct {
	Version             int    `json:"version"`
	GateMode            string `json:"gate_mode"`
	Compress            bool   `json:"compress"`
	CodeMode            bool   `json:"code_mode"`
	IntentDynamic       bool   `json:"intent_dynamic"`
	IntentProbe         bool   `json:"intent_probe"`
	IntentPrompt        bool   `json:"intent_prompt"`
	StaticIntent        string `json:"static_intent"`
	CompressMaxChars    int    `json:"compress_max_chars"`
	ExposureMode        string `json:"exposure_mode"`
	ExposureMaxB        int    `json:"exposure_max_b"`
	ExposureTokenBudget int    `json:"exposure_token_budget"`
	SlimList            bool   `json:"slim_list"`
	SlimListMaxChars    int    `json:"slim_list_max_chars"`
}

func defaultSettings() Settings {
	return Settings{
		Version:             1,
		GateMode:            "transparent",
		Compress:            true,
		CodeMode:            true,
		IntentDynamic:       true,
		IntentProbe:         true,
		IntentPrompt:        true,
		StaticIntent:        "",
		CompressMaxChars:    12000,
		ExposureMode:        "permissive",
		ExposureMaxB:        5,
		ExposureTokenBudget: 4000,
		SlimList:            false,
		SlimListMaxChars:    120,
	}
}

// ResolveGlobalPath returns COSTGATE_GATE_SETTINGS_PATH or ~/.costgate/gate-settings.json.
func ResolveGlobalPath() string {
	if p := os.Getenv("COSTGATE_GATE_SETTINGS_PATH"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "gate-settings.json"
	}
	return filepath.Join(home, ".costgate", "gate-settings.json")
}

// ResolveProjectPath returns <COSTGATE_PROJECT_ROOT>/.costgate/gate-settings.json or "".
func ResolveProjectPath() string {
	root := os.Getenv("COSTGATE_PROJECT_ROOT")
	if root == "" {
		return ""
	}
	return filepath.Join(root, ".costgate", "gate-settings.json")
}

func normalize(raw map[string]any) Settings {
	out := defaultSettings()
	if raw == nil {
		return out
	}
	if v, ok := raw["gate_mode"].(string); ok && (v == "filter" || v == "transparent") {
		out.GateMode = v
	}
	for _, key := range []string{"compress", "code_mode", "intent_dynamic", "intent_probe", "intent_prompt", "slim_list"} {
		if v, ok := raw[key].(bool); ok {
			switch key {
			case "compress":
				out.Compress = v
			case "code_mode":
				out.CodeMode = v
			case "intent_dynamic":
				out.IntentDynamic = v
			case "intent_probe":
				out.IntentProbe = v
			case "intent_prompt":
				out.IntentPrompt = v
			case "slim_list":
				out.SlimList = v
			}
		}
	}
	if v, ok := raw["static_intent"].(string); ok {
		out.StaticIntent = v
	}
	if v, ok := asInt(raw["compress_max_chars"]); ok && v > 0 {
		out.CompressMaxChars = v
	}
	if v, ok := raw["exposure_mode"].(string); ok {
		switch v {
		case "conservative", "aggressive", "budget", "permissive":
			out.ExposureMode = v
		}
	}
	if v, ok := asInt(raw["exposure_max_b"]); ok && v >= 0 {
		out.ExposureMaxB = v
	}
	if v, ok := asInt(raw["exposure_token_budget"]); ok && v >= 0 {
		out.ExposureTokenBudget = v
	}
	if v, ok := asInt(raw["slim_list_max_chars"]); ok && v >= 32 {
		out.SlimListMaxChars = v
	}
	return out
}

func asInt(v any) (int, bool) {
	switch n := v.(type) {
	case float64:
		return int(n), true
	case int:
		return n, true
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	default:
		return 0, false
	}
}

func readFile(path string) (Settings, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Settings{}, err
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return Settings{}, err
	}
	return normalize(raw), nil
}

// Load reads global + optional project gate-settings (project overrides global).
func Load() (*Settings, error) {
	globalPath := ResolveGlobalPath()
	out := defaultSettings()
	if data, err := readFile(globalPath); err == nil {
		out = data
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if projectPath := ResolveProjectPath(); projectPath != "" {
		if data, err := readFile(projectPath); err == nil {
			merged := map[string]any{}
			gb, _ := json.Marshal(out)
			_ = json.Unmarshal(gb, &merged)
			pb, _ := json.Marshal(data)
			var project map[string]any
			_ = json.Unmarshal(pb, &project)
			for k, v := range project {
				merged[k] = v
			}
			normalized := normalize(merged)
			out = normalized
		} else if !os.IsNotExist(err) {
			return nil, err
		}
	}
	return &out, nil
}

// FileModTime returns the latest mtime among existing settings files.
func FileModTime() (time.Time, error) {
	var latest time.Time
	for _, path := range []string{ResolveGlobalPath(), ResolveProjectPath()} {
		if path == "" {
			continue
		}
		st, err := os.Stat(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return time.Time{}, err
		}
		if st.ModTime().After(latest) {
			latest = st.ModTime()
		}
	}
	return latest, nil
}

// Generation returns a short hash for config sync status.
func (s *Settings) Generation() string {
	if s == nil {
		return ""
	}
	h := sha256.New()
	_, _ = fmt.Fprintf(h, "%s|%t|%t|%t|%t|%t|%s|%d|%s|%d|%d|%t|%d",
		s.GateMode, s.Compress, s.CodeMode, s.IntentDynamic, s.IntentProbe, s.IntentPrompt,
		s.StaticIntent, s.CompressMaxChars, s.ExposureMode, s.ExposureMaxB, s.ExposureTokenBudget,
		s.SlimList, s.SlimListMaxChars)
	return hex.EncodeToString(h.Sum(nil))[:16]
}

func boolEnv(v bool) string {
	if v {
		return "1"
	}
	return "0"
}

// ApplyToEnv writes settings into process environment (runtime hot-reload).
func (s *Settings) ApplyToEnv() {
	if s == nil {
		return
	}
	_ = os.Setenv("COSTGATE_GATE_MODE", s.GateMode)
	_ = os.Setenv("COSTGATE_COMPRESS", boolEnv(s.Compress))
	_ = os.Setenv("COSTGATE_CODE_MODE", boolEnv(s.CodeMode))
	_ = os.Setenv("COSTGATE_INTENT_DYNAMIC", boolEnv(s.IntentDynamic))
	_ = os.Setenv("COSTGATE_INTENT_PROBE", boolEnv(s.IntentProbe))
	_ = os.Setenv("COSTGATE_INTENT_PROMPT", boolEnv(s.IntentPrompt))
	_ = os.Setenv("COSTGATE_INTENT", s.StaticIntent)
	_ = os.Setenv("COSTGATE_COMPRESS_MAX_CHARS", strconv.Itoa(s.CompressMaxChars))
	_ = os.Setenv("COSTGATE_EXPOSURE_MODE", s.ExposureMode)
	_ = os.Setenv("COSTGATE_EXPOSURE_MAX_B", strconv.Itoa(s.ExposureMaxB))
	_ = os.Setenv("COSTGATE_EXPOSURE_TOKEN_BUDGET", strconv.Itoa(s.ExposureTokenBudget))
	_ = os.Setenv("COSTGATE_SLIM_LIST", boolEnv(s.SlimList))
	_ = os.Setenv("COSTGATE_SLIM_LIST_MAX_CHARS", strconv.Itoa(s.SlimListMaxChars))
}

// ApplyEffective loads settings from disk and applies them to the environment.
func ApplyEffective() error {
	s, err := Load()
	if err != nil {
		return err
	}
	s.ApplyToEnv()
	return nil
}
