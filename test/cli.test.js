// End-to-end: runs the real bin against a mock Unity server.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { closedPortUrl, makeUnityProject, SAMPLE_ERRORS, startMockUnity } from './helpers/mock-unity.js';

const BIN = fileURLToPath(new URL('../cli/index.js', import.meta.url));
const { version } = createRequire(import.meta.url)('../package.json');

function cli(args, { url, cwd } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, NO_COLOR: '1', UNITY_AGENT_BRIDGE_URL: url ?? 'http://127.0.0.1:9' };
    delete env.FORCE_COLOR;
    execFile(process.execPath, [BIN, ...args], { env, cwd }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

describe('unity-beaver', () => {
  it('prints its version', async () => {
    const { code, stdout } = await cli(['--version']);
    assert.equal(code, 0);
    assert.equal(stdout.trim(), `unity-beaver ${version}`);
  });

  it('shows help with no arguments', async () => {
    const { code, stdout } = await cli([]);
    assert.equal(code, 0);
    assert.match(stdout, /Commands/);
    assert.match(stdout, /check/);
  });

  it('suggests the closest command for a typo', async () => {
    const { code, stderr } = await cli(['chek']);
    assert.equal(code, 2);
    assert.match(stderr, /Did you mean check\?/);
  });

  it('rejects unknown options', async () => {
    const { code, stderr } = await cli(['check', '--nope']);
    assert.equal(code, 2);
    assert.match(stderr, /Unknown option: --nope/);
  });

  it('exits 2 and points at doctor when Unity is not running', async () => {
    const { code, stderr } = await cli(['check'], { url: await closedPortUrl() });
    assert.equal(code, 2);
    assert.match(stderr, /Can't reach Unity/);
    assert.match(stderr, /unity-beaver doctor/);
  });

  it('reports compile errors with locations and exits 1', async () => {
    const unity = await startMockUnity({ scenario: 'fail', errors: SAMPLE_ERRORS });
    try {
      const { code, stdout } = await cli(['check'], { url: unity.url });
      assert.equal(code, 1);
      assert.match(stdout, /Unity found 2 compile errors/);
      assert.match(stdout, /Assets\/Scripts\/PlayerController\.cs:15:10\n {2}error CS1002: ; expected/);
      assert.match(stdout, /1 warning \(not blocking/);
    } finally {
      await unity.close();
    }
  });

  it('emits JSON for scripts and agents', async () => {
    const unity = await startMockUnity({ scenario: 'fail', errors: SAMPLE_ERRORS });
    try {
      const { code, stdout } = await cli(['check', '--json'], { url: unity.url });
      const report = JSON.parse(stdout);
      assert.equal(code, 1);
      assert.equal(report.ok, false);
      assert.equal(report.errors.length, 2);
      assert.equal(report.errors[1].code, 'CS0103');
      assert.equal(report.warnings.length, 1);
    } finally {
      await unity.close();
    }
  });

  it('exits 0 after a successful compile and domain reload', async () => {
    const unity = await startMockUnity({ scenario: 'reload' });
    try {
      const { code, stdout } = await cli(['check'], { url: unity.url });
      assert.equal(code, 0, stdout);
      assert.match(stdout, /Unity compiled successfully/);
      assert.deepEqual(unity.state.requests.slice(0, 2), ['/refresh', '/ping']);
    } finally {
      await unity.close();
    }
  });

  it('init --dry-run previews without writing', async () => {
    const root = makeUnityProject();
    const before = fs.readFileSync(path.join(root, 'Packages', 'manifest.json'), 'utf8');
    const { code, stdout } = await cli(['init', '--dry-run'], { cwd: path.join(root, 'Assets') });
    assert.equal(code, 0);
    assert.match(stdout, /Would add the Unity package/);
    assert.equal(fs.readFileSync(path.join(root, 'Packages', 'manifest.json'), 'utf8'), before);
    assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
  });

  it('init sets up the project and says what to do next', async () => {
    const root = makeUnityProject();
    const { code, stdout } = await cli(['init', root]);
    assert.equal(code, 0);
    assert.match(stdout, /Added the Unity package/);
    assert.match(stdout, /unity-beaver doctor/);
    assert.ok(fs.existsSync(path.join(root, 'AGENTS.md')));

    const again = await cli(['init', root]);
    assert.match(again.stdout, /Already set up/);
  });

  it('init explains what to do outside a Unity project', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uab-empty-'));
    const { code, stderr } = await cli(['init'], { cwd: dir });
    assert.equal(code, 1);
    assert.match(stderr, /No Unity project found/);
  });
});
