<div align="center">
  <img src=".github/logo.png" alt="Unity Beaver logo" width="120" height="120">
  <h1>Unity Beaver</h1>
  <p><b>Let AI coding agents compile their C# in your running Unity Editor, and fix their own mistakes.</b></p>
  <a href="https://www.npmjs.com/package/unity-beaver"><img src="https://img.shields.io/npm/v/unity-beaver?style=flat-square&label=npm" alt="npm version"></a>
  <a href="https://github.com/ruizhengu/unity-beaver/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ruizhengu/unity-beaver/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/ruizhengu/unity-beaver/stargazers"><img src="https://img.shields.io/github/stars/ruizhengu/unity-beaver?style=flat-square" alt="Stars"></a>
  <img src="https://img.shields.io/badge/Unity-2021.3%2B-black?style=flat-square&logo=unity" alt="Unity 2021.3+">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 18+">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT License"></a>
</div>

<br>

```text
$ unity-beaver check
✗ Unity found 1 compile error · 4.1s

  Assets/Scripts/PlayerController.cs:15:10
  error CS1002: ; expected

Fix the errors above, then run unity-beaver check again.

  … the agent adds the missing semicolon …

$ unity-beaver check
✓ Unity compiled successfully · 6.3s
```

## Features

- **Closes the loop**: after editing C#, your agent runs one command and gets Unity's real compiler errors back, so it fixes them before you switch windows
- **One-command setup**: `unity-beaver init` adds the Unity package and the agent instructions to your project
- **Works with any agent**: Claude Code, Codex, Cursor, Copilot, Gemini CLI, or anything else that can run a shell command
- **Clear answers**: `file:line:column` locations, exit codes an agent can act on, and `--json` for scripts
- **Explains itself**: `unity-beaver doctor` checks every link in the chain and tells you how to fix what's broken
- **Small and local**: zero dependencies, talks only to `127.0.0.1`, no accounts, no telemetry

## Quick Start

You need Unity 2021.3 or newer and Node.js 18 or newer.

**1. Install the CLI**

```bash
npm install -g unity-beaver
```

That gives you two names for the same command: `unity-beaver`, and `ub` for short. Run the install again later to update.

Coming from `unity-agent-cli`, this project's old name? Run `npm uninstall -g unity-agent-cli`, then `unity-beaver init` in your project so its agent instructions use the new name.

**2. Set up your Unity project**

```bash
cd path/to/YourUnityProject
unity-beaver init
```

`init` adds the Unity package to `Packages/manifest.json` and writes compile-check instructions to `AGENTS.md`, plus a `CLAUDE.md` that points to it. Add `--dry-run` to preview first.

**3. Switch to Unity, then confirm**

Unity imports the package as soon as it has focus again. Then run:

```bash
unity-beaver doctor
```

When it says **All set**, ask your agent to change some C#. It will check its own work.

**With an AI agent**

Tell your agent:

> Set up Unity Beaver for this Unity project by reading https://raw.githubusercontent.com/ruizhengu/unity-beaver/main/llms.txt

**Run**

`ub` is short for `unity-beaver`. Agents get the full name in their instructions, since it says what it is.

```bash
ub check                # Recompile in Unity and report errors
ub check --json         # Same, as JSON
ub check --strict       # Fail on compiler warnings too
ub doctor               # Diagnose the connection and project setup
ub init --dry-run       # Preview what init would change
ub --help               # Everything else
```

<details>
<summary><strong>Other ways to install</strong></summary>

**Agent skill**: teaches Claude Code, Codex, Cursor and other agents when and how to run the check, without touching your project's `AGENTS.md`:

```bash
npx skills add ruizhengu/unity-beaver -g -y
```

As a Claude Code plugin: `/plugin marketplace add ruizhengu/unity-beaver`, then `/plugin install unity-beaver@unity-beaver`.

**Unity package by hand**: in Unity, open **Window › Package Manager**, click **+**, choose the git URL option, and paste:

```text
https://github.com/ruizhengu/unity-beaver.git?path=/UnityPackage
```

**CLI from the latest unreleased code**:

```bash
npm install -g github:ruizhengu/unity-beaver
```

**CLI from a clone**:

```bash
git clone https://github.com/ruizhengu/unity-beaver.git
cd unity-beaver
npm link
```

</details>

## How it works

```mermaid
sequenceDiagram
    participant Agent as AI agent
    participant CLI as unity-beaver
    participant Unity as Unity Editor
    Agent->>CLI: unity-beaver check
    CLI->>Unity: GET /refresh
    Note over Unity: AssetDatabase.Refresh()<br/>recompiles changed scripts
    loop until compilation and reload finish
        CLI->>Unity: GET /ping
    end
    CLI->>Unity: GET /compile-errors
    Unity-->>CLI: errors from the Console
    CLI-->>Agent: report and exit code
```

1. The **Unity package** starts a small HTTP server on `127.0.0.1:5142` when the Editor loads. It can refresh the AssetDatabase, say whether Unity is compiling, and read compile errors from the Console.
2. The **CLI** asks Unity to refresh, waits for compilation (and the domain reload after a successful compile), then reads the errors and prints a short report.
3. The **exit code** tells the agent what to do next:

| Exit | Meaning | The agent should |
|---|---|---|
| `0` | Unity compiled the project | Carry on. Warnings are listed but don't block |
| `1` | Compile errors | Fix them and run the check again |
| `2` | Couldn't reach Unity | Run `doctor` and ask you for help |

## Example

Ask your agent for something that's easy to get wrong:

> Create `Assets/Scripts/SceneLoader.cs` with a method that loads the "MainMenu" scene.

If the agent forgets `using UnityEngine.SceneManagement;`, the check catches it:

```text
✗ Unity found 1 compile error · 5.2s

  Assets/Scripts/SceneLoader.cs:12:9
  error CS0103: The name 'SceneManager' does not exist in the current context
```

The agent adds the directive, runs the check again, gets exit `0`, and only then tells you it's done.

## Configuration

It works without configuration.

- `UNITY_AGENT_TIMEOUT` (60): seconds to wait for Unity to come back after it reloads scripts. Raise it for large projects.
- `NO_COLOR`: plain output. Colors and the spinner already switch off when output isn't a terminal, so agents always get clean text.

## Troubleshooting

Start with `unity-beaver doctor`. It checks each piece and prints a `→` hint for anything that's wrong.

- **"Can't reach Unity"**: the Editor has to be open with your project, and the package installed. Unity's Console should show `Unity Agent Server started on http://127.0.0.1:5142/`.
- **"Port 5142 is already in use" in the Unity Console**: only one Unity Editor can own the bridge. Close the other project (or whatever `doctor` names), then restart Unity.
- **A check takes about 8 seconds even when nothing changed**: Unity never says "nothing to compile", so the CLI waits a moment to see whether compilation starts.
- **`unity-agent-cli: command not found`**: that's the command's name before 0.3.0. Run `unity-beaver init` to update the instructions it wrote, and change any you wrote by hand. `doctor` points out files that still use the old name.
- **Warnings show up but the check passes**: that's on purpose. Use `--strict` to make warnings fail.
- **Runtime logs and exceptions are ignored**: the check is about compiling. Play-mode errors don't fail it.

## Safety and privacy

- The server listens on `127.0.0.1` only, so nothing on your network can reach it.
- The only action it exposes is an asset refresh, the same as pressing Refresh in Unity. Everything else is read-only.
- `init` only touches `Packages/manifest.json`, `AGENTS.md`, and `CLAUDE.md`. It keeps what's already there and is safe to run again.
- No telemetry and no accounts.

## Contributing

Issues and pull requests are welcome. `npm test` runs everything with no install step. [AGENTS.md](AGENTS.md) explains the layout and the few rules that keep existing installs working.

## License

[MIT](LICENSE)
