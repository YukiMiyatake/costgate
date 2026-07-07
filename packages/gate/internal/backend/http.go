package backend

import (
	"net"
	"net/http"
	"time"

	"github.com/YukiMiyatake/costgate/packages/gate/internal/config"
)

const (
	defaultHTTPTimeout   = 60 * time.Second
	defaultDialTimeout   = 15 * time.Second
	defaultHTTPMaxRetries = 10
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
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout: defaultDialTimeout,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          8,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	if len(cfg.Headers) > 0 {
		return &http.Client{
			Timeout:   defaultHTTPTimeout,
			Transport: &headerRoundTripper{headers: cfg.Headers, base: transport},
		}
	}
	return &http.Client{
		Timeout:   defaultHTTPTimeout,
		Transport: transport,
	}
}
