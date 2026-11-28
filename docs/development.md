# Development and tests

Node.js 26+ and Go 1.27.4+.

```bash
make check     # npm ci, typecheck, the runtime, catalog and plugin tests (Vitest), the built-in bundle matches the sources; gofmt, vet, staticcheck of bundle and driver
make web       # rebuild the built-in bundle into bundle/src/dist (commit it)
make install   # reasonr-ui from packages/vite into the global npm bin
```

The web driver's browser tests are in [reasonr-dist](https://github.com/tycheg/reasonr-dist) (`integration/web`): they need a whole `reasonrd`. There `TestPlatformUI` takes a platform's own UI build (`integration/web/testdata/ui`: the standard catalog and its own `Tag` on the taxi model, the packages of this repository from npm) the whole way a platform does: `reasonr-ui types`, `typecheck`, `test`, `build`, then `reasonrd check` (C0016), the engine serving the build and the web driver going through every taxi place on it.

A release is a tag `vX.Y.Z` with the npm packages of that version, `bundle/vX.Y.Z` and `driver/vX.Y.Z` of the Go modules.

The runtime tests run the taxi screen descriptions from `packages/runtime/test/fixtures`: copies of the compiler's `uiview` golden files (the engine serves the descriptions the compiler builds), the contract between the model and the runtime.

## Publishing

The packages `@tycheg/reasonr-runtime`, `@tycheg/reasonr-std-ui` and `@tycheg/reasonr-vite` are published to the public npm registry (npmjs.com) with the version of this repository, after `npm ci && npm run typecheck && npm test` and with an npm account that owns the `@tycheg` scope:

```bash
make publish   # npm publish -w packages/runtime -w packages/std-ui -w packages/vite
```

A platform UI build requires them by version (`"@tycheg/reasonr-vite": "^0.1.0"`); installing needs no token.
