import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileAndCollect, DEFAULT_TIMINGS, ReloadTimeoutError } from '../cli/lib/compile.js';
import { fakeBridge, SAMPLE_ERRORS } from './helpers/mock-unity.js';

const fast = { pollMs: 5, startPolls: 4, settleMs: 5, reloadTimeoutMs: 100 };

describe('compileAndCollect', () => {
  it('keeps the timings tuned against real Unity Editors', () => {
    assert.deepEqual({ ...DEFAULT_TIMINGS }, { pollMs: 500, startPolls: 15, settleMs: 1000, reloadTimeoutMs: 60_000 });
  });

  it('reads the console after waiting when nothing recompiles', async () => {
    const bridge = fakeBridge([false]);
    assert.deepEqual(await compileAndCollect(bridge, { timings: fast }), []);
    assert.deepEqual(bridge.calls, { refresh: 1, ping: fast.startPolls, compileErrors: 1 });
  });

  it('waits for a failed compile to finish, then returns its errors', async () => {
    const bridge = fakeBridge([false, true, true, true, false], { errors: SAMPLE_ERRORS });
    const phases = [];
    const entries = await compileAndCollect(bridge, { timings: fast, onPhase: (p) => phases.push(p) });
    assert.equal(entries, SAMPLE_ERRORS);
    assert.equal(bridge.calls.ping, 5);
    assert.deepEqual([...new Set(phases)], ['refreshing', 'waiting', 'compiling', 'reading']);
  });

  it('treats a dropped connection followed by a reconnect as a finished domain reload', async () => {
    const bridge = fakeBridge([true, true, 'down', 'down', false]);
    const phases = [];
    await compileAndCollect(bridge, { timings: fast, onPhase: (p) => phases.push(p) });
    assert.equal(bridge.calls.ping, 5);
    assert.ok(phases.includes('reloading'));
  });

  it('handles the reload starting before compilation was ever seen', async () => {
    const bridge = fakeBridge([false, 'down', 'down', false]);
    await compileAndCollect(bridge, { timings: fast });
    assert.equal(bridge.calls.ping, 4);
  });

  it('stops polling as soon as it reconnects, like the original CLI', async () => {
    // The first answer after a reload ends the wait even if it says "compiling".
    const bridge = fakeBridge([true, 'down', true, true]);
    await compileAndCollect(bridge, { timings: fast });
    assert.equal(bridge.calls.ping, 3);
  });

  it('gives up when Unity stays away longer than the reload timeout', async () => {
    const bridge = fakeBridge([true, 'down']);
    await assert.rejects(compileAndCollect(bridge, { timings: fast }), ReloadTimeoutError);
    assert.equal(bridge.calls.compileErrors, 0);
  });

  it('fails fast when Unity is not reachable at all', async () => {
    const bridge = fakeBridge([false], { refreshFails: true });
    await assert.rejects(compileAndCollect(bridge, { timings: fast }), /connection refused/);
    assert.equal(bridge.calls.ping, 0);
  });
});
