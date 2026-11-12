# Security Policy

## Supported versions

MathBoard is maintained on a best-effort basis. Security fixes are evaluated
against the current release on `main` and, when applicable, the current
desktop release. The `develop` branch contains unreleased changes; older
releases do not have a guaranteed security maintenance window.

## Reporting a vulnerability

**Please do not disclose an unpatched vulnerability in a public issue,
discussion, or pull request.**

1. Prefer [GitHub private vulnerability reporting](https://github.com/giacomobartoloni/mathboard/security/advisories/new)
   if it is enabled for the repository. Include affected versions, a
   reproducible proof of concept, likely impact, and a safe way to contact you.
2. If private reporting is not available, open a public issue asking the
   maintainer to establish a private reporting channel. **Do not include**
   exploit details, sensitive data, or reproduction steps in that public issue.

Never submit real user data, authentication secrets, or live credentials as
part of a report. A minimal, sanitized reproduction is preferred.

## Handling reports

The maintainer will evaluate severity, impact, reproducibility, and a suitable
fix or mitigation. Coordinated disclosure is preferred so users have a chance
to receive a fix before details are published.

This open-source project does not currently promise a fixed acknowledgment,
remediation, or disclosure SLA, and does not operate a vulnerability bounty
program. Please follow up through the original private channel if needed.

For ordinary bugs and feature requests that do not expose a security issue,
use the public [issue tracker](https://github.com/giacomobartoloni/mathboard/issues).
