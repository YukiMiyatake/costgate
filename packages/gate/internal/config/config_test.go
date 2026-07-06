package config

import "testing"

func TestBackendConfigValidate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     BackendConfig
		wantErr bool
	}{
		{
			name: "stdio",
			cfg:  BackendConfig{Command: "node", Args: []string{"server.mjs"}},
		},
		{
			name: "url",
			cfg:  BackendConfig{URL: "https://example.com/mcp"},
		},
		{
			name:    "missing transport",
			cfg:     BackendConfig{},
			wantErr: true,
		},
		{
			name:    "both transports",
			cfg:     BackendConfig{Command: "node", URL: "https://example.com/mcp"},
			wantErr: true,
		},
		{
			name:    "invalid scheme",
			cfg:     BackendConfig{URL: "ftp://example.com/mcp"},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cfg.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
