# Zinuto Core repository

Zinuto Core is the GPL-3.0-only local desktop source. Its internal composition
ID is `community`; that identifier is not an edition or release channel. Repository
visibility is an external setting and never changes this source boundary.

## Development rules

- Work only on `main`. Confirm the branch before editing. Do not create source
  branches or branch-backed worktrees.
- Preserve unrelated changes. Never commit generated build output, credentials,
  signing material, or machine-specific paths.
- A release tool may create a detached worktree from an exact reviewed commit.
  Do not edit or retain that worktree as a development branch.

## Product boundary

- Core contains `Zinuto Core` with bundle identifier `org.zinuto.core`.
- Core has no official account, login, payment, support recognition, remote
  notice, presence, updater, Store SDK, private endpoint, official artwork,
  signing, notarization, publication, or deployment implementation.
- Do not hide excluded implementation behind a feature, environment variable,
  inactive route, test fixture, generated file, comment, or alternate
  composition.
- Local workflows need no identity. They work offline after local data is
  available. Only an explicit user-triggered open-source market-data connector
  may make an outbound request.
- Core has no paid tier, feature gate, license key, redemption code, public
  local HTTP API, or MCP service.
- Core publishes source tags only. Do not add GitHub Release creation, binary
  upload, `contents: write`, signing configuration, company credentials, or a
  company-signed Core artifact path.
- Read access is enough to build Core; Triage does not imply source maintenance,
  and Write is reserved for trusted maintainers. Core build access never grants
  access to the private release repository or signing hosts.

## Contracts and copy

- Change `contracts/openapi/desktop-local-api.v1.yaml` before a local HTTP shape.
- Change `contracts/native-bridge/native-bridge.v1.json` before a native
  command. Do not add aliases or unversioned compatibility routes.
- The WebView reaches the local runtime only through
  `apps/desktop/web/src/api/index.ts` and the allowlisted native bridge.
- User-visible copy is complete in `en`, `zh-CN`, `ja`, `ko`, and `es`.

## Documentation

- `README.md` describes the product and the normal commands.
- `docs/ARCHITECTURE.md` describes runtime ownership and data flow.
- `CONTRIBUTING.md` owns the development workflow.
- JSON files under `docs/registry` connect features, contracts, path scopes,
  source roots, and quality commands. Update the registry with the code change.
- Do not create another Markdown file for a fact already owned by one of these
  documents. `npm run docs:check` rejects missing registry paths and stale
  commands; workspace documentation governance rejects undeclared Markdown.

## Validation

- While editing: `npm run check:fast -- --files <changed-files...>`.
- Before handoff: `npm run check:affected -- --files <changed-files...>` and
  `npm run check:public-repo`.
- Contract changes: `npm run contract:generate`, then
  `npm run contract:check`.
- Native runtime changes: `npm run desktop:runtime:check:build` and the
  relevant Cargo gate.
- Before release: `npm run check:full`.

Generated directories such as `dist`, `gen`, runtime build output, `target`,
coverage, and test output are not source artifacts.

<!-- AI-GENERATED-RULES:START -->
## Path rules (generated)

`docs/registry/agent-scopes.json` owns path routing. `docs/registry/product-lanes.json` owns quality gates. `tools/quality/architecture-guard-config.mjs` owns file budgets. `npm run check:agents-rules` rejects drift.

| Path | Scope | Lane | Required gate | Generators |
| --- | --- | --- | --- | --- |
| `.` | repository governance and routing | `governance` | `npm run quality:governance` | `npm run new:*` |
| `apps/desktop/web` | desktop WebView UI, workspaces, and domains | `desktop-app` | `npm run quality:desktop-app` | `npm run new:desktop-page`, `npm run new:desktop-workspace`, `npm run new:desktop-component` |
| `apps/desktop/local-api` | local application and data runtime | `desktop-app` | `npm run quality:desktop-app` | `npm run new:local-api-route` |
| `apps/desktop/shell` | Tauri lifecycle, native bridge, and local packaging | `desktop-app` | `npm run quality:desktop-app` | none |
| `apps/desktop/local-api/src/infrastructure/assets/system-market-seed` | redistributable desktop seed data | `desktop-app` | `npm run quality:desktop-app` | none |
| `packages/shared` | shared local contracts, validation, domain facts, and i18n | `shared-contracts` | `npm run quality:shared-contracts` | none |
| `contracts` | versioned local HTTP and native bridge contracts | `shared-contracts` | `npm run quality:shared-contracts` | none |
| `tools` | generation, quality, compliance, and local Core build tools | `governance` | `npm run quality:governance` | `npm run new:quality-check` |

- `.`: Route the task to the owning path before editing. Runtime, popup, secondary-window, and bundle changes require the real build or runtime guard selected by the impact checker.
- `apps/desktop/web`: Access the local runtime only through apps/desktop/web/src/api/index.ts. Keep business truth in the runtime, update all five locales, and run the generated bundle checks for popup or secondary-window changes.
- `apps/desktop/local-api`: Change contracts/openapi/desktop-local-api.v1.yaml before a route shape, then regenerate. Preserve local-only behavior, cancellation, bounded inputs, rollback, and atomic persistence.
- `apps/desktop/shell`: Keep native commands inside contracts/native-bridge/native-bridge.v1.json. Core shell code has no official service, updater, Store, signing, or notarization implementation.
- `apps/desktop/local-api/src/infrastructure/assets/system-market-seed`: Every dataset must match its manifest and THIRD_PARTY_DATA.md record. Never commit caches, generated databases, proprietary data, or machine paths.
- `packages/shared`: Do not hand-edit generated contract outputs. Keep the five locales complete and exclude hosted-service implementation types.
- `contracts`: Contracts describe local desktop behavior only. Change the contract first, regenerate, and do not add aliases, fallback hosts, or official-service surfaces.
- `tools`: Tooling may build and validate Core only. Update the matching registry and tests when a generator, quality route, or public-boundary rule changes.

File budgets: page 1144; hook/view-model 715; application 1001; service/store 1001; router 501; css 2145. Split by responsibility before crossing a budget. Do not add compatibility aliases to avoid a proper contract or migration.

During editing, run `npm run check:fast -- --files <changed-files...>`. Before handoff, run `npm run check:affected -- --files <changed-files...>`. Before release, run `npm run check:full`.
<!-- AI-GENERATED-RULES:END -->

<!-- WORKSPACE-BOUNDARY:START -->
## Workspace ownership (generated)

- Repository: `zinuto-core`.
- Owns: local desktop UI and runtime; local HTTP and native bridge contracts; internal `community` composition and public-source governance.
- Does not own: official accounts, payments, support, notices, presence, and updater code; official branding, signing, Store submission, deployment, and production secrets.
- Cross-repository authority registry: `zinuto-release/config/documentation-policy.json`. This is a documentation reference, never a build dependency.
- Workspace execution rule: GitHub Actions must remain disabled in repository settings. Do not enable, dispatch, or watch workflows; use local or designated-host gates unless a later explicit user instruction changes this.
- Execution rule: `npm start` and `npm run desktop:dev` are development diagnostics. The formal local-source installer entrypoint is `npm run package -- --output-dir <path>`; it accepts only the output directory and builds only for the current host OS.
- Execution rule: A Core macOS local package may use only platform-required ad-hoc signatures and must have no company certificate, notarization ticket, or official updater. Core Windows application and NSIS installer outputs must remain Authenticode `NotSigned`.
- Execution rule: Windows NSIS installed-artifact acceptance must prove the packaged backend runtime, bundled Node runtime, Rust backtest engine, and AKShare onedir sidecar; compilation or installer creation alone is not installed-runtime proof.
- Test discipline: Test observable product or domain behavior only. Do not add benchmarks, load or stress tests, or assertions based on elapsed wall-clock time, local hardware, runner speed, arbitrary sleeps, or implementation timings. Keep time tests only for modeled business, security, or user-visible lifecycle rules, using a controlled clock or state boundary.
- Do not copy live release state into stable documentation. Run the authority command when current state matters.
<!-- WORKSPACE-BOUNDARY:END -->
