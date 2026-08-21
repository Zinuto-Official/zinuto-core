# Security policy

## Supported versions

Security fixes target the latest `main` revision. When a Zinuto Core source tag
in the 2.x line is published and remains supported, fixes also target the latest
such tag. Repository visibility and published-tag state are live GitHub facts;
this policy does not freeze either one in prose. Distributors maintain the
binaries they build from this source.

## Upstream advisories

Run `npm run security:audit:rust` against the checked lockfiles. Its output is
live security evidence and must not be copied into this policy as a dated
snapshot. Review every advisory path after a dependency update and before
distributing a binary.

An accepted exception must be encoded in the checked security configuration,
name the exact advisory, and include a narrow technical reason. A prose-only
exception is invalid. Do not describe a build as warning-free unless the
release evidence contains the successful audit output for that exact source.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability involving code
execution, sandbox escape, package integrity, signature verification, or local
data disclosure.

Use [GitHub private vulnerability
reporting](https://github.com/Zinuto-Official/zinuto-core/security/advisories/new)
for this repository. If that form is unavailable, use the [official contact
page](https://www.zinuto.com/en/contact/) and ask for a private security
channel. Include the affected version or commit, platform, reproduction steps,
impact, and any suggested mitigation. Do not include real user data or
credentials.

The maintainers will acknowledge a complete report, validate it privately, and
coordinate disclosure after a fix or mitigation is available. No response-time
or bounty promise is created by this document.
