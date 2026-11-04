import path from 'node:path';
import { applyPlan, findUnityProject, planInit, unityVersion } from '../lib/project.js';
import { SYMBOLS } from '../lib/ui.js';

export async function init(options, ui, { cwd = process.cwd() } = {}) {
  const { c, ce } = ui;
  const start = path.resolve(cwd, options.path ?? '.');
  const root = findUnityProject(start);

  if (!root) {
    ui.err(`${ce.red(SYMBOLS.fail)} ${ce.bold(`No Unity project found at ${start}`)}`);
    ui.err();
    ui.err('  Run init from your Unity project folder (the one with Assets/ and ProjectSettings/),');
    ui.err(`  or pass its path: ${ce.cyan('unity-beaver init path/to/MyGame')}`);
    return 1;
  }

  const plan = planInit(root);
  const problem = plan.find((step) => step.action === 'error');
  if (problem) {
    ui.err(`${ce.red(SYMBOLS.fail)} ${ce.bold(problem.summary)}`);
    ui.err(ce.dim('  Nothing was changed.'));
    return 1;
  }

  const dryRun = Boolean(options['dry-run']);
  if (!dryRun) applyPlan(root, plan);

  const version = unityVersion(root);
  ui.out(c.bold(`Unity Beaver · init${dryRun ? ' (dry run)' : ''}`));
  ui.out();
  ui.out(`  ${c.dim('Project')}  ${root}${version ? c.dim(` · Unity ${version}`) : ''}`);
  ui.out();
  for (const step of plan) {
    if (step.warn) ui.out(`  ${c.yellow(SYMBOLS.warn)} ${step.summary}`);
    else if (step.action === 'skip') ui.out(`  ${c.dim(SYMBOLS.skip)} ${c.dim(step.summary)}`);
    else if (dryRun) ui.out(`  ${c.cyan(SYMBOLS.arrow)} Would ${lowerFirst(step.summary)}`);
    else ui.out(`  ${c.green(SYMBOLS.ok)} ${pastTense(step.summary)}`);
  }
  ui.out();

  const changes = plan.filter((step) => step.action !== 'skip').length;
  if (dryRun) {
    ui.out(changes ? `Nothing was written. Run ${c.cyan('unity-beaver init')} to apply.` : 'Already set up. Nothing to change.');
    return 0;
  }
  if (changes === 0) {
    ui.out(`Already set up. Run ${c.cyan('unity-beaver doctor')} to check the connection.`);
    return 0;
  }
  ui.out(c.bold('Next'));
  ui.out(`  1. Switch to Unity so it imports the package ${c.dim('(the Console shows "Unity Agent Server started")')}`);
  ui.out(`  2. Run ${c.cyan('unity-beaver doctor')} to confirm everything is connected`);
  return 0;
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

function pastTense(summary) {
  return summary
    .replace(/^Add /, 'Added ')
    .replace(/^Create /, 'Created ')
    .replace(/^Refresh /, 'Refreshed ');
}
