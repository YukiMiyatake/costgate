package backend

import (
	"net/http"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
)

type headerRoundTripper struct {
	headers map[string]string
	base    http.RoundTripper
}

func (t *headerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	for k, v := range t.headers {
		req.Header.Set(k, v)
	}
	return base.RoundTrip(req)
}

func httpClientForBackend(cfg config.BackendConfig) *http.Client {
	if len(cfg.Headers) == 0 {
		return http.DefaultClient
	}
	return &http.Client{
		Transport: &headerRoundTripper{
			headers: cfg.Headers,
			base:    http.DefaultTransport,
		},
	}
}
