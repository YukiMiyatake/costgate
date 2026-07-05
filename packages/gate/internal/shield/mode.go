package shield

// Mode controls redact aggressiveness derived from MCP trust level.
type Mode int

const (
	// ModeOff — trusted: no redaction.
	ModeOff Mode = iota
	// ModeSecrets — standard: known secret patterns only.
	ModeSecrets
	// ModeAggressive — restricted: secrets plus paths, email, phone.
	ModeAggressive
	// ModeFull — untrusted: redact all non-trivial string values.
	ModeFull
)
