# Project governance

Zinuto Core is GPL-licensed source. Repository visibility and package
availability are external state and do not change this governance model. The
company controls official releases and project governance.

## Roles

- **Users and contributors** may use, fork, modify, redistribute, discuss, and
  propose changes under the GPL.
- **Maintainers** are appointed by 轻创掘金（青岛）信息技术有限公司 and may triage
  issues, review pull requests, and maintain project documentation.
- **Release managers** are company-authorized maintainers with access to
  protected official release environments.

## Decision and merge authority

The company controls the official GitHub organization, repository settings,
`main` branch, release tags, roadmap, and merge decisions. This control applies
to the official project only and does not limit lawful forks.

External contributions to `main` require a pull request, successful required
checks, a valid CLA result, and approval from a company-appointed maintainer.
The project does not claim a two-maintainer or two-person review model. Force
pushes and tag deletion are prohibited. Release tags must be signed.

## Repository access and source tags

Read access is sufficient for anyone who only needs to inspect or build the
source. Triage is the maximum routine role for people who handle issues and
pull requests without maintaining source. Write access is limited to trusted
source maintainers; the ability to build Core is never a reason to grant it.

Before the repository becomes public, rulesets must protect `main` and `v*`.
Only authorized maintainers may create signed annotated `v*` tags, and no one
may update or delete them. A source version stops at the Git tag: maintainers do
not create a GitHub Release object or attach DMG, EXE, or other binary assets.

Every Core Actions workflow declares `contents: read`. Core has no company
signing Secret, Variable, Environment, or self-hosted signing runner. Core
contributors and build operators do not receive access to the private release
repository, signing Keychains, Windows private keys, or official release hosts.

## Source versions and local builds

The company identifies reviewed Core source versions with protected signed
`v*` Git tags. Core does not create GitHub Release objects, upload binary
assets, or publish a company-signed Core installer.

Anyone may inspect, modify, and build the GPL source. The standard package
command produces a local installer without a company certificate,
notarization, official updater, or company release receipt. A signed Git tag
authenticates the source reference; it does not turn a local build into a
company-issued application.

Company code signing, notarization, updater signing, Store identities, and
final artifact receipts apply only to official Zinuto compositions maintained
in the private release repository.

## Licensing decisions

Only the copyright holder may approve commercial licenses. Only the trademark
owner may authorize official branding or OEM trademark use. Maintainers cannot
grant either right merely by merging a pull request.
