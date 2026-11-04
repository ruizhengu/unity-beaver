---
name: unity-agent-bridge
description: "Compile-check Unity C# in the running Unity Editor with unity-agent-cli, then fix the errors it reports. Use after creating, editing, moving, or deleting .cs files in a Unity project (a folder with Assets/ and ProjectSettings/), when the user asks whether their Unity scripts compile, or when setting up unity-agent-bridge. Not for editing the unity-agent-bridge source itself."
---

# Unity compile check

`unity-agent-cli` asks the Unity Editor the user has open to recompile, and
prints the compiler errors Unity found. Done means the last
`unity-agent-cli check` exited `0` after your final `.cs` change.

## After changing C#

Finish the edits for the task first, then run from anywhere inside the Unity
project:

```bash
unity-agent-cli check
```

It takes a few seconds (longer for big projects) because Unity really
compiles. Read the exit code:

| Exit | Meaning | What to do |
|---|---|---|
| `0` | Unity compiled the project | Done. Warnings, if listed, don't block |
| `1` | Compile errors | Fix each error at its `file:line:column`, then run the check again. Repeat until `0` |
| `2` | Couldn't reach Unity, or Unity didn't come back after reloading | Run `unity-agent-cli doctor`, tell the user what it reports, and stop retrying |

Use `unity-agent-cli check --json` when you want structured output: `errors`
and `warnings` arrays with `file`, `line`, `column`, `code`, and `message`.

Rules:

1. Fix the cause the compiler names. Don't delete or comment out code just to
   make the check pass, and don't suppress errors with `#pragma` unless the
   user asks.
2. One check per batch of edits is enough; don't run it after every single
   file.
3. Only compile errors fail the check. Don't chase warnings unless the user
   asks; `--strict` makes warnings fail too.
4. If the same error survives two honest attempts, show it to the user and ask.

## Setup, if the command is missing or doctor reports problems

1. `unity-agent-cli` not found: it needs Node.js 18+. Offer the install command
   and run it only after the user agrees:
   `npm install -g unity-agent-cli`
2. In the Unity project folder, run `unity-agent-cli init --dry-run`, show the
   user what it would change, then `unity-agent-cli init`. It adds the Unity
   package to `Packages/manifest.json` and writes these instructions to
   `AGENTS.md`.
3. Ask the user to switch to the Unity Editor so it imports the package, then
   run `unity-agent-cli doctor`. Setup is done when it ends with "All set."

`doctor` checks the Unity process, the bridge connection on
`127.0.0.1:5142`, and the project setup, and prints a `→` hint for each problem.
Relay those hints; most fixes (opening Unity, closing another Unity instance
that holds the port) are for the user to do.
