// Hooks for `npm version` (see AGENTS.md → Releasing).
//   node scripts/version.js check  (preversion) stop before anything changes if
//                                   CHANGELOG.md has no section for the new version
//   node scripts/version.js sync   (version) copy the new version into the
//                                   Claude Code plugin manifest
import fs from 'node:fs';

const PLUGIN_MANIFEST = 'plugins/unity-beaver/.claude-plugin/plugin.json';
const version = process.env.npm_new_version;

if (!version) {
  console.error('Run this through npm: npm version <patch | minor | major | x.y.z>');
  process.exit(1);
}

const step = process.argv[2];
if (step === 'check') {
  const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm');
  if (!heading.test(fs.readFileSync('CHANGELOG.md', 'utf8'))) {
    console.error(`\n✗ CHANGELOG.md has no "## ${version}" section yet.`);
    console.error('  Add one that describes the release, commit it, then run npm version again.\n');
    process.exit(1);
  }
} else if (step === 'sync') {
  const text = fs.readFileSync(PLUGIN_MANIFEST, 'utf8');
  fs.writeFileSync(PLUGIN_MANIFEST, text.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`));
} else {
  console.error(`Unknown step: ${step ?? '(none)'}. Use "check" or "sync".`);
  process.exit(1);
}
