# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately using GitHub's **Report a vulnerability**
form for this repository:
[Open a private security advisory](https://github.com/CrimsBerith/LociAR/security/advisories/new).
You can also find it under **Security → Advisories → Report a vulnerability**.

**Do not open a public issue or pull request to disclose a vulnerability.** Do not
post exploit details, credentials, personal data, or production records publicly.
If private reporting is unavailable, request a private reporting channel from the
repository owner before sharing sensitive details.

Include the affected component and version or commit, reproduction steps, expected
and observed behavior, and the security impact. Use redacted examples and test
accounts. Do not access, modify, or delete other users' data to demonstrate impact.
The maintainer will coordinate investigation and disclosure through the private
advisory; a response or resolution timeline is not currently guaranteed.

## Scope

- The native iOS application in `LociAR/`.
- Firebase Cloud Functions in `functions/`.
- The Next.js admin panel and public pages in `admin/`.
- Firestore and Storage Security Rules (`firestore.rules` and `storage.rules`).

The security contract and contribution requirements are documented in
[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
