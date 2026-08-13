# Architecture

This is the architectural source of truth for Zinuto Core. The repository has
one product and one local desktop composition. Its internal composition ID is
`community`; that identifier does not name a separate edition or release channel.

## Runtime

```text
React WebView
  -> typed API facade
  -> allowlisted Tauri bridge
  -> embedded local Node.js runtime
  -> SQLite / DuckDB / Rust backtest sidecar
```

- The WebView owns presentation and typed view models.
- The local runtime owns application rules, persistence, imports, portable
  packages, and workspace state.
- The Tauri shell owns process lifecycle, bounded native commands, filesystem
  grants and staging, windows, menus, and internal transport.
- SQLite stores application state; DuckDB stores market data.
- The Rust sidecar performs backtests through a bounded local process contract.

macOS uses an application-private Unix socket. Windows uses a random loopback
port. The native `backend_http_request` command is the only WebView transport;
the local HTTP listener is not a public integration surface.

Window integration is intentionally platform-specific. macOS keeps the native
overlay title bar and traffic lights. On Windows the shell removes native
decorations before the first show, keeps the native shadow and resize behavior,
and lets the WebView render the themed chrome for main and secondary windows.
The WebView can only invoke the checked window-command allowlist.

The main local runtime owns normal SQLite schema startup and the DuckDB market
database. The history-retention worker is the narrow exception: it sets
`ZINUTO_SKIP_DATABASE_AUTO_INIT=1` before importing the database graph, opens
an isolated connection to an already-current Core schema, skips schema and seed
writes, does not probe the DuckDB file held by the main runtime, and computes
startup headroom without the market-data scratch allowance. Do not reuse this
maintenance-only mode as a general startup path.

On Windows, the native shell reads an enabled user-scoped WinINet proxy and
passes a validated HTTP or HTTPS endpoint to the local runtime as
`ZINUTO_MARKET_DATA_HTTPS_PROXY`. Only the explicit CCXT market-data acquisition
path consumes that value. It does not create an automatic network task or a
general application proxy surface.

Build-time Node acquisition has one checked authority at
`config/open-source/node-runtime-authority.json`. It binds `.nvmrc`, target
platform, exact archive bytes and SHA-256 to an upstream Node.js release
manifest whose OpenPGP signer is verified locally. Acquisition rejects
redirects and unbounded responses. Installation materializes only regular
files and directories into a private no-follow staging tree; the fixed upstream
wrapper-link set is ignored and regenerated as regular files, while every other
link or special entry is rejected. The complete tree is validated before
execution, a verified last-known-good runtime is preserved, and the validated
staging directory is swapped into place without deleting the current runtime.

## Local package closure

`npm start` is the development runner. `npm run package -- --output-dir <path>`
is the target-OS Core packaging path; it stages and validates the local Node.js
runtime, compiled local API, npm runtime dependencies, Rust backtest engine,
and pinned AKShare sidecar before producing the installer. The Windows NSIS
resource hook must copy that complete closure into the installed layout because
declaring a Tauri resource is not by itself installed-layout evidence.

The packaging path rejects company signing and release credentials. It uses
recursive ad-hoc code signatures on macOS only to make the self-built native
closure runnable, and requires both the Windows application and installer to
remain Authenticode `NotSigned`. Neither state is a Zinuto distribution
signature, notarization, publication, or installed-artifact acceptance result.

## Ownership

| Area | Source of truth |
| --- | --- |
| UI and workspaces | `apps/desktop/web` |
| Application and persistence | `apps/desktop/local-api` |
| Native lifecycle and bridge | `apps/desktop/shell` |
| Backtesting | `apps/desktop/backtest-engine` |
| Bundled assets | `apps/desktop/local-api/src/infrastructure/assets/system-market-seed` |
| Types, validation, i18n | `packages/shared` |
| Local HTTP contract | `contracts/openapi/desktop-local-api.v1.yaml` |
| Native command contract | `contracts/native-bridge/native-bridge.v1.json` |

Contracts change before implementations. Generated outputs are regenerated and
checked; aliases, unversioned routes, and compatibility redirects are not
added. Cross-repository imports, submodules, private packages, and
machine-specific source paths are forbidden.

## Data flow

Market-data acquisition and import are separate user actions. A connector
writes normalized files into a user-selected folder. Import then stages,
previews, validates, maps, and commits those files. All limits are shared
between the native contract and local runtime.

Portable `.otp-package` archives use `schemaVersion: 2`, per-file SHA-256
digests, bounded expansion, traversal protection, temporary validation, and
atomic commit. A failed validation or commit leaves the installed data intact.

The database manifest describes only the current public schema. Private or
retired schemas are not retained as executable migration history in this
repository.

## Public-source boundary

Core has no remote product-service contract or client. User identity, login,
payments, supporter recognition, remote notices, product updates, distribution
store SDKs, private endpoints, signing, and publication automation belong
outside this repository.

`tools/open-source/check-public-repo.mjs` enforces this boundary by path and
content. `tools/release/desktop-composition.mjs` accepts only the internal
`community` identity. The default Tauri feature set registers only local commands.

User-triggered open-source market-data connectors are the sole intentional
outbound capability. They cannot gate local features, run automatically, or
download executable code.
