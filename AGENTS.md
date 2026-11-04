# AGENTS.md

Notes for AI agents and humans working on this repository.

## Layout

| Path | What it is |
|---|---|
| `cli/` | The `unity-agent-cli` Node.js CLI. `index.js` is the bin, `main.js` parses arguments, `commands/` holds `check`, `doctor`, `init`, and `lib/` the shared pieces |
| `UnityPackage/` | The Unity Editor package (UPM). It runs the HTTP server inside Unity |
| `plugins/unity-agent-bridge/` | Agent skill, also published as a Claude Code plugin through `.claude-plugin/marketplace.json` |
| `llms.txt` | Setup steps an agent can follow on a user's behalf |
| `test/` | `node --test` suites. `test/helpers/mock-unity.js` fakes the Unity side |
| `scripts/version.js` | Release hooks that `npm version` runs |

## Commands

```bash
npm test                     # all tests, no install step needed
node cli/index.js <command>  # run the CLI from your checkout
npm link                     # put your checkout on PATH as unity-agent-cli
claude plugin validate --strict .
```

## Rules

- **The CLI has zero dependencies and supports Node.js 18+.** Use only `node:` built-ins.
- **Don't break installed Unity packages.** Users install `UnityPackage/` with the git URL `...unity-agent-bridge.git?path=/UnityPackage`, so never rename or move that folder. The HTTP contract (`/refresh`, `/ping`, `/compile-errors` on `127.0.0.1:5142`, documented in `cli/lib/bridge.js`) must stay backward compatible.
- **C# needs a Unity Editor to verify.** Don't change `UnityPackage/` unless asked. If you do, test it in a Unity project that references your checkout as a local package (`"com.unityagentbridge.server": "file:/path/to/UnityPackage"`), run `unity-agent-cli check` there, and loop on any compile errors until it exits `0`. If no Unity Editor is available, say so plainly instead of claiming it works.
- **Keep the compile timings in `cli/lib/compile.js`** unless you can test against a real Editor; they were tuned on one.
- **Keep versions in sync:** `package.json` and `plugins/unity-agent-bridge/.claude-plugin/plugin.json`. `test/meta.test.js` checks this. Add a `CHANGELOG.md` entry for user-visible changes.
- **Write output for people and agents at once:** say what happened and what to do next, keep it short, use exit codes consistently (`check`: 0 compiled, 1 compile errors, 2 couldn't check), and never print colors or spinners when output isn't a TTY.
- **Git:** don't commit or push. The maintainer reviews and commits changes.

## Releasing

The CLI is published to npm as [`unity-agent-cli`](https://www.npmjs.com/package/unity-agent-cli). Pushing a `v*` tag runs `.github/workflows/release.yml`, which tests, publishes to npm with provenance, and creates a GitHub release from the matching `CHANGELOG.md` section.

1. Add a `## x.y.z (date)` section to `CHANGELOG.md` and commit it.
2. `npm version patch` (or `minor`, `major`, `x.y.z`). It refuses if step 1 is missing, runs the tests, bumps `package.json` and the plugin manifest together, and creates the commit and tag.
3. `git push --follow-tags`

Bump the Unity package's own version (`UnityPackage/package.json`) only when its C# changes.

**One-time npm setup** (already done once the package exists on npm):

1. Publish the first version by hand from the repo root: `npm login`, then `npm publish`. npm only lets an existing package trust a publisher.
2. On npmjs.com, open the package's **Settings › Trusted Publisher**, choose GitHub Actions, and enter owner `ruizhengu`, repository `unity-agent-bridge`, workflow `release.yml`, no environment, and allow `npm publish`.
3. Use it within two days: npm expires a trusted publisher that hasn't completed a publish by then (delete and re-add it if that happens). Once it works, consider **Publishing access › Require two-factor authentication and disallow tokens**.
