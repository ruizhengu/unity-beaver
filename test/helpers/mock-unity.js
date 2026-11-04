// Test doubles for the Unity side of the bridge.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

/**
 * A real HTTP server that speaks the bridge protocol. After /refresh it plays a
 * scenario on a timeline (ms after the refresh):
 *   idle   - nothing changes (no scripts were edited)
 *   fail   - compiles from 100 to 1200, then reports `errors` (no domain reload)
 *   reload - compiles from 100, drops every connection at 800 like a domain
 *            reload, and comes back on the same port at 1500 with no errors
 */
export async function startMockUnity({ scenario = 'idle', errors = [] } = {}) {
  const state = { compiling: false, errors: [], requests: [] };
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  const server = http.createServer((req, res) => {
    state.requests.push(req.url);
    const send = (body) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/ping') return send({ isCompiling: state.compiling });
    if (req.url === '/compile-errors') return send(state.errors);
    if (req.url === '/refresh') {
      send({ status: 'ok' });
      play();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  function play() {
    if (scenario === 'fail') {
      at(100, () => (state.compiling = true));
      at(1200, () => Object.assign(state, { compiling: false, errors }));
    } else if (scenario === 'reload') {
      at(100, () => (state.compiling = true));
      at(800, () => {
        server.close();
        server.closeAllConnections();
      });
      at(1500, () => {
        Object.assign(state, { compiling: false, errors: [] });
        relisten();
      });
    }
  }

  // Windows can refuse to rebind a just-closed port for a moment; retry.
  function relisten() {
    const retry = () => timers.push(setTimeout(relisten, 50));
    server.once('error', retry);
    server.listen(port, '127.0.0.1', () => server.removeListener('error', retry));
  }

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    state,
    async close() {
      timers.forEach(clearTimeout);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/** A URL where nothing is listening. */
export async function closedPortUrl() {
  const server = http.createServer();
  // Windows can refuse to rebind a just-closed port for a moment; retry.
  function relisten() {
    const retry = () => timers.push(setTimeout(relisten, 50));
    server.once('error', retry);
    server.listen(port, '127.0.0.1', () => server.removeListener('error', retry));
  }

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}

/**
 * An in-memory bridge whose /ping answers come from a script. Each item is
 * `true`/`false` (isCompiling) or `'down'` (connection fails). The last item
 * repeats forever.
 */
export function fakeBridge(pings, { errors = [], refreshFails = false } = {}) {
  const calls = { refresh: 0, ping: 0, compileErrors: 0 };
  return {
    url: 'http://fake',
    calls,
    async refresh() {
      calls.refresh++;
      if (refreshFails) throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
      return { status: 'ok' };
    },
    async ping() {
      const answer = pings[Math.min(calls.ping++, pings.length - 1)];
      if (answer === 'down') throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
      return { isCompiling: answer };
    },
    async compileErrors() {
      calls.compileErrors++;
      return errors;
    },
  };
}

/** Collects what a command prints. */
export function captureUI() {
  const stream = () => ({ isTTY: false, text: '', write(chunk) { this.text += chunk; return true; } });
  return { stdout: stream(), stderr: stream(), env: {} };
}

/** Creates a minimal Unity project on disk and returns its path. */
export function makeUnityProject(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uab-project-'));
  const defaults = {
    'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (abc)\n',
    'Packages/manifest.json': '{\n  "dependencies": {\n    "com.unity.ugui": "1.0.0"\n  }\n}\n',
    'Assets/.keep': '',
  };
  for (const [file, content] of Object.entries({ ...defaults, ...files })) {
    if (content == null) continue;
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

export const SAMPLE_ERRORS = [
  {
    File: 'Assets/Scripts/PlayerController.cs',
    Line: 15,
    Message: "Assets/Scripts/PlayerController.cs(15,10): error CS1002: ; expected",
  },
  {
    File: 'Assets/Scripts/SceneLoader.cs',
    Line: 12,
    Message: "Assets/Scripts/SceneLoader.cs(12,9): error CS0103: The name 'SceneManager' does not exist in the current context",
  },
  {
    File: 'Assets/Scripts/Enemy.cs',
    Line: 4,
    Message: "Assets/Scripts/Enemy.cs(4,17): warning CS0414: The field 'Enemy.speed' is assigned but its value is never used",
  },
];
