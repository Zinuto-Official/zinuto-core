# Contributing to Zinuto Core

Thank you for taking the time to help. Useful contributions include code,
tests, translations, documentation, reproducible bug reports, and careful
reviews.

GitHub settings determine whether contribution intake is open at a given time.
When it is open, external contributors work in a branch of their own fork and
submit a pull request to this repository's default branch. Maintainers use the
repository's `main`-only workflow.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Suspected security
problems belong in the private channel described by [SECURITY.md](SECURITY.md),
not in an issue or pull request.

## Before you start

1. Search existing issues and pull requests.
2. For a larger feature or a change to a public contract, open an issue before
   writing the implementation. This prevents two people from solving the same
   problem in incompatible ways.
3. Read [AGENTS.md](AGENTS.md), [GOVERNANCE.md](GOVERNANCE.md), and
   [TRADEMARKS.md](TRADEMARKS.md).
4. Run `npm run docs:where -- --query "<task>"` if ownership is unclear, then
   check `docs/registry` for the feature, contract, path scope, and required
   quality gate.

Do not add a new Markdown file for a topic that already has an owner document.
Update that document or its JSON registry instead.

## Set up a fork

Use the Node.js version pinned in `.nvmrc`, Rust stable, uv `0.11.8`, the
checked npm lockfile, and the [Tauri 2 platform
prerequisites](https://v2.tauri.app/start/prerequisites/).
The Ubuntu `Core Change CI` and `Full Desktop Gate` jobs must install the same
Tauri 2 Linux development libraries before any affected or full gate can
compile the shell; Playwright's browser dependencies do not replace the GTK,
WebKitGTK, AppIndicator, XDo, SVG, and OpenSSL development packages.

```sh
git clone https://github.com/<your-github-name>/zinuto-core.git
cd zinuto-core
git remote add upstream https://github.com/Zinuto-Official/zinuto-core.git
npm ci
npm start
```

Create a focused branch in your fork:

```sh
git switch -c fix/short-description
```

Keep your branch current without rewriting somebody else's work:

```sh
git fetch upstream
git rebase upstream/main
```

`npm start` runs the local desktop application. The first run builds the local
Node.js runtime, the Rust backtest engine, and the pinned Python data sidecar.
No private configuration is required.

To create a local installer:

```sh
npm run package -- --output-dir /absolute/path/to/output
```

The result is a self-built Core package. It accepts no company signing input
and is not an official Zinuto release. The packager uses ad-hoc signatures on
macOS only to make the local native closure runnable; Windows output must stay
Authenticode `NotSigned`. Build on the target operating system and keep the
Node.js, local API, npm dependencies, backtest engine, and AKShare sidecar in
the validated installer closure.

## Keep the change focused

- Make one coherent change per pull request.
- Preserve unrelated changes in your working tree.
- Add or update tests for behavior changes.
- Update `en`, `zh-CN`, `ja`, `ko`, and `es` together when user-visible copy
  changes. Desktop copy belongs in `packages/shared/src/i18n/messages/*.json`,
  not in an application service or React component.
- Use the shared UI primitives and theme tokens. Put business facts in the
  local runtime rather than the presentation layer.
- Document new dependencies and bundled data with their exact provenance and
  redistribution terms.
- Never commit credentials, personal market data, build caches, or generated
  runtime directories.

## Contracts and runtime boundaries

Edit a versioned contract before its implementation:

```sh
npm run contract:generate
npm run contract:check
```

The WebView uses `apps/desktop/web/src/api/index.ts`. Native commands stay in
the checked bridge allowlist. Core code must not add an official service,
account, payment, support, notice, presence, updater, Store, signing, or
deployment path.

Data-import changes span native staging, local planning and persistence,
shared limits, and UI presentation. Tests must cover cancellation, cleanup,
bounded inputs, traversal protection, diagnostics, and atomic commit.

## Run the checks

During editing, run a file-scoped check:

```sh
npm run check:fast -- --files <changed-files...>
```

Before opening a pull request, run:

```sh
npm run check:affected -- --base upstream/main --head HEAD
npm run check:public-repo
```

Run `npm run quality:desktop-app`, `npm run quality:shared-contracts`, or
`npm run quality:governance` for the code you changed. Native work also needs
the relevant Cargo gate and `npm run desktop:runtime:check:build`. A release
candidate requires `npm run check:full`.

If a check fails for a reason unrelated to your patch, include the exact
command and error in the pull request. Do not hide the failure or alter
unrelated files to make it disappear.

## Open the pull request

Push your branch to your fork and use GitHub to open a pull request against the
official repository's default branch:

```sh
git push -u origin fix/short-description
```

The pull request should:

- link the relevant issue;
- explain the behavior and its user impact;
- list the checks you actually ran and their results;
- include before and after screenshots for visible interface changes;
- call out contract, migration, dependency, data-provenance, or security
  implications; and
- contain no unrelated formatting or generated-file churn.

Reviews may ask for changes. Keep follow-up commits on the same branch so the
conversation and checks remain together.

## Contribution license

Contributors retain copyright. The ICLA or CCLA grants the rights needed to
maintain the GPL project and offer the same code under a commercial license.
Read [CLA.md](CLA.md) and the applicable agreement before submitting code. A
maintainer records an accepted agreement in
`contributors/cla-signatures.json`; a pull request cannot approve its own CLA.
A `Signed-off-by` line is not a substitute.

The company must approve the ICLA and CCLA templates before public contribution
intake opens.

## Developer badge

An accepted contribution can activate the Developer badge in official Zinuto.
Link GitHub from the Recognition section of your official Zinuto Account
Center, submit the pull request from a normal user account to the repository's
default branch, and have it reviewed and merged. The badge is valid for one
year from a qualifying merged contribution.

The badge is account recognition only. It does not grant repository access or
unlock Core features. See the full [Developer badge
flow](README.md#developer-badge).
