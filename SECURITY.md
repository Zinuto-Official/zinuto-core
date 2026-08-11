# Security policy

## Supported versions

Before the first public release, security fixes target the latest `main`
revision. After publication, they also target the latest published Zinuto Core
source release in the 2.x line. Distributors maintain the binaries they build
from this source.

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
