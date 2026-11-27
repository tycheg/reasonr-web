# ReasonR web

The web interface of ReasonR models: the React runtime that runs the screen descriptions the engine serves, the standard primitive catalog on Ant Design, the `reasonr-ui` build tool for a platform's own primitives, and the `web` test driver that runs acceptance tests through the UI in a browser.

## Layout

| Path | What it is |
|---|---|
| `packages/runtime` | `@tycheg/reasonr-runtime`: the app shell, sign-in (test mode and OIDC), screen descriptions, data, forms, navigation, notifications, `data-rr` labels for UI tests, the automatic UI |
| `packages/std-ui` | `@tycheg/reasonr-std-ui`: the standard catalog (`compiler/internal/std/ui.rr` in [reasonr-compiler](https://github.com/tycheg/reasonr-compiler)) on Ant Design |
| `packages/vite` | `@tycheg/reasonr-vite`: the `reasonr-ui` command (dev, test, build, types, typecheck) and the Vite plugin with a platform's own primitive implementations |
| `app` | The built-in bundle: the runtime and the standard catalog |
| `bundle` | Go module `github.com/tycheg/reasonr-web/bundle`: embeds the built-in bundle (`dist/`, committed) and registers it as the server's default UI (`registry.RegisterUIBundle`); sources and `dist/` in `src/` |
| `driver` | Go module `github.com/tycheg/reasonr-web/driver`: the `web` test driver (Playwright), a plugin (`kind.RegisterDriver`) with the command `reasonrd web install`; sources in `src/` |
| `docs` | The documentation |

The standard `reasonrd` distribution ([reasonr-dist](https://github.com/tycheg/reasonr-dist)) links both, so `reasonrd` serves the UI without Node and runs `--driver web`. `bundle` requires the contract of plugins alone (`reasonr-engine/port`); `driver` requires the engine (`kind`), the contract and the compiler.

## Contracts

The npm packages follow the screen descriptions and the app API of the engine (RFC §22, §31.4). The Go modules are plugins: `bundle` imports only `port/registry` (`RegisterUIBundle`); `driver` imports `kind` (`TestDriver`, `TestAPI`, `RegisterDriver`), `port/registry` (`RegisterCommand`) and the compiler for the UI program and test step types (plan 0021, L6). Their browser tests run in the distribution (`reasonr-dist`, `integration/web`): they need a whole `reasonrd`.

## Documentation

- [The interface](docs/interface.md)
- [Tests through the UI](docs/testing.md)
- [Development and tests](docs/development.md)
