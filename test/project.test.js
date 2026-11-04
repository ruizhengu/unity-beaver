import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PACKAGE_NAME, PACKAGE_URL } from '../cli/lib/constants.js';
import {
  AGENT_INSTRUCTIONS,
  applyPlan,
  BLOCK_END,
  BLOCK_START,
  findUnityProject,
  installedPackage,
  instructionsFile,
  outdatedInstructions,
  planInit,
  unityVersion,
} from '../cli/lib/project.js';
import { makeUnityProject } from './helpers/mock-unity.js';

const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
const actions = (plan) => Object.fromEntries(plan.map((step) => [step.file.replace(/\\/g, '/'), step.action]));

describe('findUnityProject', () => {
  it('finds the project root from a nested folder', () => {
    const root = makeUnityProject({ 'Assets/Scripts/Player.cs': '' });
    assert.equal(findUnityProject(path.join(root, 'Assets', 'Scripts')), root);
    assert.equal(unityVersion(root), '2022.3.10f1');
  });

  it('returns null outside a Unity project', () => {
    const root = makeUnityProject({ 'ProjectSettings/ProjectVersion.txt': null });
    assert.equal(findUnityProject(root), null);
  });
});

describe('planInit / applyPlan', () => {
  it('sets up a fresh project and is idempotent', () => {
    const root = makeUnityProject();
    const plan = planInit(root);
    assert.deepEqual(actions(plan), { 'Packages/manifest.json': 'update', 'AGENTS.md': 'create', 'CLAUDE.md': 'create' });

    applyPlan(root, plan);
    const manifest = JSON.parse(read(root, 'Packages/manifest.json'));
    assert.equal(manifest.dependencies[PACKAGE_NAME], PACKAGE_URL);
    assert.equal(manifest.dependencies['com.unity.ugui'], '1.0.0');
    assert.equal(read(root, 'AGENTS.md'), `${AGENT_INSTRUCTIONS}\n`);
    assert.equal(read(root, 'CLAUDE.md'), '@AGENTS.md\n');
    assert.ok(installedPackage(root));
    assert.equal(instructionsFile(root), 'AGENTS.md');

    assert.deepEqual(actions(planInit(root)), { 'Packages/manifest.json': 'skip', 'AGENTS.md': 'skip', 'CLAUDE.md': 'skip' });
  });

  it('appends to existing instruction files without touching their content', () => {
    const root = makeUnityProject({ 'AGENTS.md': '# My rules\n\nUse tabs.\n', 'CLAUDE.md': '# Claude\nBe brief.' });
    applyPlan(root, planInit(root));
    assert.equal(read(root, 'AGENTS.md'), `# My rules\n\nUse tabs.\n\n${AGENT_INSTRUCTIONS}\n`);
    assert.equal(read(root, 'CLAUDE.md'), `# Claude\nBe brief.\n\n${AGENT_INSTRUCTIONS}\n`);
  });

  it('refreshes an outdated block in place', () => {
    const old = `# Rules\n\n${BLOCK_START}\nold text\n${BLOCK_END}\n\n## More\n`;
    const root = makeUnityProject({ 'AGENTS.md': old, 'CLAUDE.md': '@AGENTS.md\n' });
    const plan = planInit(root);
    assert.equal(actions(plan)['AGENTS.md'], 'update');
    applyPlan(root, plan);
    assert.equal(read(root, 'AGENTS.md'), `# Rules\n\n${AGENT_INSTRUCTIONS}\n\n## More\n`);
  });

  it('leaves hand-written instructions alone', () => {
    for (const command of ['unity-beaver', 'ub']) {
      const root = makeUnityProject({ 'CLAUDE.md': `Always run \`${command} check\` after editing C#.\n` });
      const step = planInit(root).find((s) => s.file === 'CLAUDE.md');
      assert.equal(step.action, 'skip');
      assert.ok(!step.warn);
    }
  });

  it('flags hand-written instructions that use the old command name', () => {
    const root = makeUnityProject({ 'CLAUDE.md': 'Always run `unity-agent-cli check` after editing C#.\n' });
    const step = planInit(root).find((s) => s.file === 'CLAUDE.md');
    assert.equal(step.action, 'skip');
    assert.ok(step.warn);
    assert.match(step.summary, /Change it to unity-beaver/);
  });

  it('finds instructions that still use the old command name', () => {
    const oldBlock = `${BLOCK_START}\nRun \`unity-agent-cli check\`.\n${BLOCK_END}\n`;
    const root = makeUnityProject({ 'AGENTS.md': oldBlock, 'CLAUDE.md': 'Run `unity-agent-cli check`.\n' });
    assert.deepEqual(outdatedInstructions(root), [
      { file: 'AGENTS.md', fix: 'init' },
      { file: 'CLAUDE.md', fix: 'edit' },
    ]);
    applyPlan(root, planInit(root));
    assert.deepEqual(outdatedInstructions(root), [{ file: 'CLAUDE.md', fix: 'edit' }]);
  });

  it('keeps a package that is already installed from another source', () => {
    const manifest = JSON.stringify({ dependencies: { [PACKAGE_NAME]: 'file:../unity-agent-bridge/UnityPackage' } });
    const root = makeUnityProject({ 'Packages/manifest.json': manifest });
    assert.equal(actions(planInit(root))['Packages/manifest.json'], 'skip');
  });

  it('preserves Windows line endings', () => {
    const root = makeUnityProject({
      'Packages/manifest.json': '{\r\n  "dependencies": {}\r\n}\r\n',
      'AGENTS.md': '# Rules\r\n',
    });
    applyPlan(root, planInit(root));
    assert.ok(!/[^\r]\n/.test(read(root, 'Packages/manifest.json')));
    assert.ok(!/[^\r]\n/.test(read(root, 'AGENTS.md')));
  });

  it('refuses to guess when the manifest is missing or broken', () => {
    assert.equal(actions(planInit(makeUnityProject({ 'Packages/manifest.json': null })))['Packages/manifest.json'], 'error');
    assert.equal(actions(planInit(makeUnityProject({ 'Packages/manifest.json': '{ nope' })))['Packages/manifest.json'], 'error');
  });
});
