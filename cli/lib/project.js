// Finding a Unity project and planning the files `init` writes. Planning is
// pure, so `init --dry-run`, `doctor`, and the tests all share it.

import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_NAME, PACKAGE_URL, REPO_URL } from './constants.js';

export const BLOCK_START = '<!-- unity-agent-bridge:start -->';
export const BLOCK_END = '<!-- unity-agent-bridge:end -->';

export const AGENT_INSTRUCTIONS = `${BLOCK_START}
## Unity compile check

This Unity project uses [Unity Beaver](${REPO_URL}) to compile C# in the running Unity Editor.

After you create, edit, move, or delete any \`.cs\` file, run \`unity-beaver check\` before you call the work done:

- Exit \`0\`: Unity compiled the project. Warnings don't block.
- Exit \`1\`: read each error (\`file:line:column\` and message), fix the code, and run the check again. Repeat until it exits \`0\`.
- Exit \`2\`: the check couldn't reach Unity. Run \`unity-beaver doctor\`, tell the user what it reports, and stop retrying.
${BLOCK_END}`;

const CLAUDE_IMPORT = '@AGENTS.md';

// The command was called unity-agent-cli before 0.3.0, and that name no longer exists.
const OLD_COMMAND = /\bunity-agent-cli\b/;

/** Walks up from `start` to the folder that holds ProjectSettings/ProjectVersion.txt. */
export function findUnityProject(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'ProjectSettings', 'ProjectVersion.txt'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function unityVersion(root) {
  const text = readText(path.join(root, 'ProjectSettings', 'ProjectVersion.txt'));
  return text?.match(/m_EditorVersion:\s*(\S+)/)?.[1] ?? null;
}

/** Returns the manifest's dependency entry for the bridge package, or null. */
export function installedPackage(root) {
  const text = readText(path.join(root, 'Packages', 'manifest.json'));
  if (text == null) return null;
  try {
    return JSON.parse(text).dependencies?.[PACKAGE_NAME] ?? null;
  } catch {
    return null;
  }
}

/** Returns the file that holds agent instructions for the bridge, or null. */
export function instructionsFile(root) {
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    if (mentionsBridge(readText(path.join(root, name)))) return name;
  }
  return null;
}

/**
 * Instructions that still tell agents to run unity-agent-cli. `fix` is 'init' when
 * the old name is only inside the block init wrote (so init can refresh it), and
 * 'edit' when someone wrote it by hand.
 */
export function outdatedInstructions(root) {
  const found = [];
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const text = readText(path.join(root, file));
    if (text == null || !OLD_COMMAND.test(text)) continue;
    const start = text.indexOf(BLOCK_START);
    const end = text.indexOf(BLOCK_END);
    const outside = start !== -1 && end > start ? text.slice(0, start) + text.slice(end) : text;
    found.push({ file, fix: OLD_COMMAND.test(outside) ? 'edit' : 'init' });
  }
  return found;
}

/**
 * Plans the changes `init` makes. Each step is
 * { file, action: 'create' | 'update' | 'skip', summary, content? }.
 */
export function planInit(root) {
  return [planManifest(root), planAgents(root), planClaude(root)];
}

export function applyPlan(root, plan) {
  for (const step of plan) {
    if (step.action === 'skip') continue;
    const file = path.join(root, step.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, step.content);
  }
}

function planManifest(root) {
  const file = path.join('Packages', 'manifest.json');
  const text = readText(path.join(root, file));
  if (text == null) {
    return { file, action: 'error', summary: `${file} not found. Open the project in Unity once to create it.` };
  }

  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (err) {
    return { file, action: 'error', summary: `${file} isn't valid JSON (${err.message}). Fix it, then run init again.` };
  }

  const current = manifest.dependencies?.[PACKAGE_NAME];
  if (current) return { file, action: 'skip', summary: `Unity package already in ${file}` };

  manifest.dependencies = { ...manifest.dependencies, [PACKAGE_NAME]: PACKAGE_URL };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const content = `${JSON.stringify(manifest, null, 2)}\n`.replace(/\n/g, eol);
  return { file, action: 'update', summary: `Add the Unity package to ${file}`, content };
}

function planAgents(root) {
  const file = 'AGENTS.md';
  const text = readText(path.join(root, file));
  if (text == null) {
    return { file, action: 'create', summary: `Create ${file} with compile-check instructions`, content: `${AGENT_INSTRUCTIONS}\n` };
  }
  return planBlock(file, text);
}

function planClaude(root) {
  const file = 'CLAUDE.md';
  const text = readText(path.join(root, file));
  if (text == null) {
    return { file, action: 'create', summary: `Create ${file} that points Claude Code at AGENTS.md`, content: `${CLAUDE_IMPORT}\n` };
  }
  if (text.split(/\r?\n/).some((line) => line.trim() === CLAUDE_IMPORT)) {
    return { file, action: 'skip', summary: `${file} already imports AGENTS.md` };
  }
  return planBlock(file, text);
}

// Adds the instructions block to an existing file, or refreshes it in place.
function planBlock(file, text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = AGENT_INSTRUCTIONS.replace(/\n/g, eol);
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END);

  if (start !== -1 && end > start) {
    const content = text.slice(0, start) + block + text.slice(end + BLOCK_END.length);
    return content === text
      ? { file, action: 'skip', summary: `${file} instructions are up to date` }
      : { file, action: 'update', summary: `Refresh the instructions in ${file}`, content };
  }
  if (mentionsBridge(text)) {
    return OLD_COMMAND.test(text)
      ? { file, action: 'skip', warn: true, summary: `${file} still says unity-agent-cli, the old name. Change it to unity-beaver` }
      : { file, action: 'skip', summary: `${file} already has compile-check instructions (left as is)` };
  }
  const separator = text.length === 0 || text.endsWith(eol + eol) ? '' : text.endsWith(eol) ? eol : eol + eol;
  return { file, action: 'update', summary: `Add compile-check instructions to ${file}`, content: `${text}${separator}${block}${eol}` };
}

function mentionsBridge(text) {
  // Instructions from before 0.3.0 say unity-agent-cli. They count, so init doesn't add a second set.
  return text != null && (text.includes(BLOCK_START) || /\b(unity-beaver|ub|unity-agent-cli) check\b/.test(text));
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
