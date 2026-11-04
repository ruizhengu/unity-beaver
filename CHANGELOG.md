# Changelog

## 0.2.0 (2026-11-04)

The Unity package is unchanged (still 0.1.0), so projects that already have it don't need to update anything in Unity.

### Added

- `unity-agent-cli init` sets up a Unity project in one step: it adds the Unity package to `Packages/manifest.json` and compile-check instructions to `AGENTS.md` and `CLAUDE.md`. It works from any folder inside the project, supports `--dry-run`, and is safe to run again.
- `check --json` for structured output and `check --strict` to fail on compiler warnings.
- An agent skill and Claude Code plugin (`npx skills add ruizhengu/unity-agent-bridge`), and `llms.txt` so an agent can do the whole setup for you.
- A progress spinner and colors in interactive terminals. Output stays plain for agents and pipes, and `NO_COLOR` is respected.
- `UNITY_AGENT_TIMEOUT` for large projects that take a while to reload.
- `--version`, `--help`, and "did you mean" suggestions for mistyped commands.
- Published to npm as `unity-agent-cli`: `npm install -g unity-agent-cli`. Tagged releases publish automatically from GitHub Actions with provenance.
- Tests and CI on macOS, Linux, and Windows.

### Changed

- `check` exits `2` instead of `1` when it can't reach Unity, so agents can tell "fix your code" apart from "Unity isn't there".
- Compiler warnings and runtime console logs no longer fail `check`. Only compile errors do (or warnings too, with `--strict`).
- Errors are printed as `file:line:column` followed by the compiler message.
- `check` waits up to 60 seconds (was about 15) for Unity to come back after a domain reload.
- `doctor` runs every check instead of stopping at the first problem, gives a fix for each one, works on Linux, and also checks the project's setup.
- The CLI's `package.json` moved to the repository root, so it can also be installed straight from GitHub: `npm install -g github:ruizhengu/unity-agent-bridge`.

### Fixed

- `doctor` exited before its connection check finished, so it never reported whether the bridge was reachable.
- `doctor` mistook Unity Hub for the Unity Editor.

### Removed

- `GEMINI.md`, the copied agent workflow files, and the demo script with a deliberate syntax error.

## 0.1.0

- First release: the Unity package with its HTTP server, and `unity-agent-cli check` and `doctor`.
