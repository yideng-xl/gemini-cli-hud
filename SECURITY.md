# Security Policy

## Supported Versions

Only the latest minor release of Gemini CLI HUD receives security fixes. Older versions are not patched — please upgrade.

| Version | Supported          |
| ------- | ------------------ |
| 0.6.x   | :white_check_mark: |
| < 0.6   | :x:                |

## Reporting a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

Report privately to **xulei0331@gmail.com** with:

- A description of the issue and its impact.
- Steps to reproduce, or a proof-of-concept.
- Affected version(s) and environment (OS, terminal, Gemini CLI version).
- Your name/handle if you'd like to be credited.

You can expect:

- **Acknowledgement** within 72 hours.
- **Initial assessment** within 7 days.
- **Coordinated disclosure** once a fix is available — typically within 30 days for high-severity issues.

## Scope

Gemini CLI HUD runs locally and parses Gemini CLI events. Relevant threat areas include:

- Code paths that execute or `eval` data sourced from the hook stream or `~/.gemini/hud.json`.
- Terminal-escape-sequence injection via untrusted model output rendered in the HUD.
- Supply-chain issues in dev dependencies (`tsx`, `vitest`, `typescript`).

Out of scope: vulnerabilities in upstream Gemini CLI itself — please report those to the Gemini CLI project.
