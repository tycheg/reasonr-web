// Package bundle embeds the standard web runtime build: @tycheg/reasonr-runtime and
// the standard catalog @tycheg/reasonr-std-ui (RFC §22).
// `make web` builds it from app/ into dist/; the build is committed, so
// `go install` gives a reasonrd with a UI without Node.
//
// Linking the package makes it the server's default UI (ingress.ui without
// dir or proxy); the engine core has no UI of its own.
package bundle

import (
	"embed"
	"io/fs"

	"github.com/tycheg/reasonr-engine/port/registry"
)

//go:embed all:dist
var dist embed.FS

func init() { registry.RegisterUIBundle(Bundle()) }

// Bundle returns the embedded build: index.html and assets/.
func Bundle() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		return nil
	}
	return sub
}
