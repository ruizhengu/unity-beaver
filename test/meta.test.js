// Keeps the repo's manifests and docs consistent with each other.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const json = (file) => JSON.parse(read(file));

describe('repository', () => {
  const pkg = json('package.json');

  it('keeps the CLI and plugin versions in sync', () => {
    assert.equal(json('plugins/unity-agent-bridge/.claude-plugin/plugin.json').version, pkg.version);
  });

  it('has a changelog entry for the current version', () => {
    assert.match(read('CHANGELOG.md'), new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')}\\b`, 'm'));
  });

  it('ships only the CLI to npm', () => {
    assert.deepEqual(pkg.files, ['cli/']);
    assert.equal(pkg.bin['unity-agent-cli'], 'cli/index.js');
    assert.match(read('cli/index.js'), /^#!\/usr\/bin\/env node\r?\n/);
  });

  it('points the marketplace at a plugin with a valid skill', () => {
    const [plugin] = json('.claude-plugin/marketplace.json').plugins;
    const skill = read(`${plugin.source.slice(2)}/skills/unity-agent-bridge/SKILL.md`);
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? '';
    assert.match(frontmatter, /^name: unity-agent-bridge\r?$/m);
    assert.match(frontmatter, /^description: .{50,}/m);
  });

  it('keeps the Unity package where installed projects expect it', () => {
    assert.equal(json('UnityPackage/package.json').name, 'com.unityagentbridge.server');
  });
});
