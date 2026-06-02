# Contributing to Gemini CLI HUD

Thanks for your interest in improving Gemini CLI HUD. This project is a small, independently-maintained extension for [Gemini CLI](https://github.com/google/gemini-cli) — contributions of any size are welcome.

## Ways to contribute

- **Bug reports** — open an issue with reproduction steps, your OS, terminal emulator, Gemini CLI version, and (if relevant) a redacted `~/.gemini/hud.json`.
- **Feature requests** — open an issue describing the use case before sending a PR for non-trivial features.
- **Pull requests** — for typos, doc fixes, and small bugs, feel free to PR directly. For larger changes, please discuss in an issue first.
- **Translations** — bilingual README maintenance (EN/CN) is appreciated; matching structure across languages matters.

## Development setup

Requirements: Node.js 22+ and pnpm 10+.

```bash
git clone https://github.com/yideng-xl/gemini-cli-hud.git
cd gemini-cli-hud
pnpm install
pnpm run build       # tsc → dist/
pnpm test            # vitest
pnpm run dev         # tsx watch
```

To test the HUD end-to-end against your local Gemini CLI, run `bash install.sh` after building to symlink into `~/.gemini/extensions/`.

## Coding conventions

- **Language**: TypeScript, strict mode.
- **Runtime deps**: zero — keep it that way. Dev deps are allowed.
- **Style**: match the surrounding code. No formatter is enforced.
- **Tests**: add or update `*.test.ts` next to the module you change. New rendering modules should have at least a snapshot-level test.

## Commit messages

Conventional Commits, lowercase type, imperative mood:

```
feat: add OpenRouter model detection
fix: handle empty git output on detached HEAD
docs: update zh-CN README with v0.6 features
refactor: extract cost calculator into pure module
```

Group related changes into a single commit; avoid drive-by reformatting in feature commits.

## Pull request checklist

- [ ] Built locally (`pnpm run build`) and tests pass (`pnpm test`).
- [ ] Updated `README.md` **and** `README.zh-CN.md` if user-facing behaviour changed.
- [ ] Updated `package.json` version only as part of a release commit, not in feature PRs.
- [ ] No new runtime dependencies added.

## Reporting security issues

Please **do not** use public issues for security reports. See [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).
