import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { doctor } from '../cli/commands/doctor.js';
import { applyPlan, planInit } from '../cli/lib/project.js';
import { createUI } from '../cli/lib/ui.js';
import { captureUI, fakeBridge, makeUnityProject } from './helpers/mock-unity.js';

const probe = (unityProcesses, owner = null) => ({
  unityProcesses: async () => unityProcesses,
  portOwner: async () => owner,
});

async function run(deps) {
  const io = captureUI();
  const code = await doctor({}, createUI(io), deps);
  return { code, out: io.stdout.text };
}

describe('doctor', () => {
  it('reports all clear for a set-up project with Unity running', async () => {
    const root = makeUnityProject();
    applyPlan(root, planInit(root));
    const { code, out } = await run({ bridge: fakeBridge([false]), cwd: root, probe: probe(1) });
    assert.equal(code, 0);
    assert.match(out, /✓ Bridge is responding/);
    assert.match(out, /Unity 2022\.3\.10f1/);
    assert.match(out, /Agent instructions found in AGENTS\.md/);
    assert.match(out, /All set\./);
  });

  it('tells you to open Unity when it is not running', async () => {
    const { code, out } = await run({ bridge: fakeBridge(['down']), cwd: process.cwd(), probe: probe(0) });
    assert.equal(code, 1);
    assert.match(out, /✗ Bridge isn't responding/);
    assert.match(out, /Open your project in the Unity Editor, then run doctor again/);
  });

  it('points at init when the package is missing', async () => {
    const root = makeUnityProject();
    const { code, out } = await run({ bridge: fakeBridge(['down']), cwd: root, probe: probe(1) });
    assert.equal(code, 1);
    assert.match(out, /Run: unity-beaver init/);
    assert.match(out, /Unity package is missing/);
  });

  it('names the process squatting on the port', async () => {
    const bridge = { url: 'http://127.0.0.1:5142', ping: async () => Promise.reject(Object.assign(new Error('HTTP 404 from /ping'), { code: 'BAD_STATUS' })) };
    const { out } = await run({ bridge, cwd: process.cwd(), probe: probe(1, { pid: 42, name: 'node' }) });
    assert.match(out, /answering on port 5142: node \(pid 42\)/);
  });

  it('still works when process detection is unavailable', async () => {
    const { out } = await run({ bridge: fakeBridge([false]), cwd: process.cwd(), probe: probe(null) });
    assert.match(out, /◎ Couldn't check for a running Unity Editor/);
  });
});
