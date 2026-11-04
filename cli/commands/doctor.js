import { execFile } from 'node:child_process';
import { createBridge } from '../lib/bridge.js';
import { VERSION } from '../lib/constants.js';
import { findUnityProject, installedPackage, instructionsFile, unityVersion } from '../lib/project.js';
import { plural, SYMBOLS } from '../lib/ui.js';

export async function doctor(options, ui, { bridge = createBridge(), cwd = process.cwd(), probe = systemProbe } = {}) {
  const checks = [];
  const add = (status, title, hints = []) => checks.push({ status, title, hints });

  // Gather facts first so each failure can point at the most likely fix.
  const unityCount = await probe.unityProcesses().catch(() => null);
  const root = findUnityProject(cwd);
  const pkg = root ? installedPackage(root) : null;
  const pingStarted = Date.now();
  const ping = await bridge.ping().then(
    (status) => ({ status, ms: Date.now() - pingStarted }),
    (error) => ({ error }),
  );

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= 18) add('ok', `unity-agent-cli ${VERSION} on Node.js ${process.version}`);
  else add('fail', `Node.js ${process.version} is too old`, ['Install Node.js 18 or newer']);

  if (unityCount == null) add('skip', "Couldn't check for a running Unity Editor");
  else if (unityCount === 0) add('warn', 'No Unity Editor process found');
  else if (unityCount === 1) add('ok', 'Unity Editor is running');
  else add('warn', `${unityCount} Unity Editors are running`, ['Only one can own the bridge port; agents talk to whichever got it first']);

  if (ping.status) {
    const state = ping.status.isCompiling ? 'compiling' : 'idle';
    add('ok', `Bridge is responding at ${bridge.url} · ${ping.ms}ms · ${state}`);
  } else {
    add('fail', `Bridge isn't responding at ${bridge.url} (${ping.error.message})`, await bridgeHints(ping.error, { unityCount, root, pkg, bridge, probe }));
  }

  if (!root) {
    add('skip', 'Not inside a Unity project', ['Run doctor from your project folder to check its setup too']);
  } else {
    const version = unityVersion(root);
    add('ok', `Unity project: ${root}${version ? ` (Unity ${version})` : ''}`);
    if (pkg) add('ok', 'Unity package is in Packages/manifest.json');
    else add('fail', 'Unity package is missing from Packages/manifest.json', ['Run: unity-agent-cli init']);
    const file = instructionsFile(root);
    if (file) add('ok', `Agent instructions found in ${file}`);
    else add('warn', 'No agent instructions in AGENTS.md or CLAUDE.md', ['Run: unity-agent-cli init']);
  }

  const failures = checks.filter((item) => item.status === 'fail').length;
  const ok = failures === 0;

  if (options.json) {
    ui.out(JSON.stringify({ ok, version: VERSION, checks }, null, 2));
    return ok ? 0 : 1;
  }

  const { c } = ui;
  const icon = {
    ok: c.green(SYMBOLS.ok),
    fail: c.red(SYMBOLS.fail),
    warn: c.yellow(SYMBOLS.warn),
    skip: c.dim(SYMBOLS.skip),
  };
  ui.out(c.bold('Unity Agent Bridge · doctor'));
  ui.out();
  for (const item of checks) {
    ui.out(`  ${icon[item.status]} ${item.status === 'skip' ? c.dim(item.title) : item.title}`);
    for (const hint of item.hints) ui.out(c.dim(`    ${SYMBOLS.arrow} ${hint}`));
  }
  ui.out();
  if (ok) ui.out(`${c.green('All set.')} Your agent can run ${c.cyan('unity-agent-cli check')}.`);
  else ui.out(`${c.red(`${plural(failures, 'problem')} found.`)} Follow the ${SYMBOLS.arrow} hints above, then run doctor again.`);
  return ok ? 0 : 1;
}

async function bridgeHints(error, { unityCount, root, pkg, bridge, probe }) {
  if (error.code === 'TIMEOUT') {
    return ["Unity accepted the connection but didn't answer. It may be frozen or waiting on a dialog."];
  }
  if (error.code !== 'ECONNREFUSED') {
    const port = Number(new URL(bridge.url).port) || 80;
    const owner = await probe.portOwner(port).catch(() => null);
    const who = owner ? `: ${owner.name} (pid ${owner.pid})` : '';
    return [`Something other than the bridge is answering on port ${port}${who}`, 'Close it, then restart Unity so the bridge can take the port'];
  }
  if (unityCount === 0) return ['Open your project in the Unity Editor, then run doctor again'];
  if (root && !pkg) return ['The Unity package isn\'t installed. Run: unity-agent-cli init, then switch to Unity'];
  return [
    'In the Unity Console, look for "Unity Agent Server started on http://127.0.0.1:5142/"',
    'If it says the port is in use, close whatever holds it and restart Unity',
    'Unity may still be importing or compiling; wait for it to finish',
    ...(root ? [] : ['Not installed yet? Run unity-agent-cli init in your Unity project folder']),
  ];
}

// Best-effort OS probes. Each returns null when it can't tell.
export const systemProbe = {
  async unityProcesses() {
    if (process.platform === 'win32') {
      const result = await run('tasklist', ['/FI', 'IMAGENAME eq Unity.exe', '/FO', 'CSV', '/NH']);
      return result.failed ? null : (result.stdout.match(/"Unity\.exe"/gi) || []).length;
    }
    const result = await run('pgrep', ['-x', 'Unity']);
    return result.failed ? null : result.stdout.split('\n').filter(Boolean).length;
  },
  async portOwner(port) {
    if (process.platform === 'win32') return null;
    const result = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']);
    const pid = result.stdout.match(/^p(\d+)/m)?.[1];
    return pid ? { pid: Number(pid), name: result.stdout.match(/^c(.+)$/m)?.[1] ?? 'unknown' } : null;
  },
};

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 3000, windowsHide: true }, (err, stdout) => {
      // pgrep exits 1 when nothing matches; only a missing or hung tool is a failure.
      resolve({ failed: Boolean(err && (err.code === 'ENOENT' || err.killed)), stdout: String(stdout ?? '') });
    });
  });
}
