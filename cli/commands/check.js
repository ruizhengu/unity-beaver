import { createBridge } from '../lib/bridge.js';
import { compileAndCollect, ReloadTimeoutError } from '../lib/compile.js';
import { classify, location } from '../lib/diagnostics.js';
import { formatDuration, plural, SYMBOLS } from '../lib/ui.js';

export const EXIT = { OK: 0, ERRORS: 1, UNREACHABLE: 2 };

const PHASES = {
  refreshing: 'Asking Unity to refresh',
  waiting: 'Waiting for Unity to pick up changes',
  compiling: 'Unity is compiling',
  reloading: 'Unity is reloading scripts',
  reading: 'Reading the console',
};

const MAX_LISTED_WARNINGS = 10;
const MAX_MESSAGE_LINES = 8;

export async function check(options, ui, { bridge = createBridge(), timings } = {}) {
  const started = Date.now();
  const spinner = options.json ? { update() {}, stop() {} } : ui.spinner(PHASES.refreshing);
  const envTimeoutMs = timeoutFromEnv();

  let entries;
  try {
    entries = await compileAndCollect(bridge, {
      timings: envTimeoutMs ? { ...timings, reloadTimeoutMs: envTimeoutMs } : timings,
      onPhase: (phase) => spinner.update(PHASES[phase]),
    });
  } catch (err) {
    spinner.stop();
    return reportFailure(err, bridge, options, ui, Date.now() - started);
  }
  spinner.stop();

  const durationMs = Date.now() - started;
  const { errors, warnings, ignored } = classify(entries);
  const blocking = options.strict ? [...errors, ...warnings] : errors;
  const ok = blocking.length === 0;

  if (options.json) {
    ui.out(JSON.stringify({ ok, status: ok ? 'success' : 'errors', durationMs, errors, warnings, ignored }, null, 2));
    return ok ? EXIT.OK : EXIT.ERRORS;
  }

  const { c } = ui;
  if (ok) {
    const extra = warnings.length ? ` · ${plural(warnings.length, 'warning')}` : '';
    ui.out(`${c.green(SYMBOLS.ok)} ${c.bold('Unity compiled successfully')} ${c.dim(`· ${formatDuration(durationMs)}${extra}`)}`);
    printWarnings(warnings, ui);
    return EXIT.OK;
  }

  const label = options.strict ? 'problem' : 'compile error';
  ui.out(`${c.red(SYMBOLS.fail)} ${c.bold(`Unity found ${plural(blocking.length, label)}`)} ${c.dim(`· ${formatDuration(durationMs)}`)}`);
  for (const diagnostic of blocking) {
    ui.out();
    const where = location(diagnostic);
    if (where) ui.out(`  ${c.cyan(where)}`);
    ui.out(indent(describe(diagnostic)));
  }
  if (!options.strict) printWarnings(warnings, ui);
  ui.out();
  ui.out(c.dim('Fix the errors above, then run unity-beaver check again.'));
  return EXIT.ERRORS;
}

function reportFailure(err, bridge, options, ui, durationMs) {
  const timedOut = err instanceof ReloadTimeoutError;
  const message = timedOut ? err.message : `Can't reach Unity at ${bridge.url} (${err.message})`;

  if (options.json) {
    ui.out(JSON.stringify({ ok: false, status: timedOut ? 'timeout' : 'unreachable', durationMs, message }, null, 2));
    return EXIT.UNREACHABLE;
  }

  const { ce } = ui;
  ui.err(`${ce.red(SYMBOLS.fail)} ${ce.bold(message)}`);
  ui.err();
  if (timedOut) {
    ui.err(`  Large project? Give Unity more time: ${ce.cyan('UNITY_AGENT_TIMEOUT=120 unity-beaver check')}`);
    ui.err(`  Or check whether Unity is stuck on a dialog or crashed.`);
  } else {
    ui.err('  Is the Unity Editor open with your project?');
    ui.err(`  Run ${ce.cyan('unity-beaver doctor')} to find out what's wrong.`);
  }
  return EXIT.UNREACHABLE;
}

function printWarnings(warnings, ui) {
  if (warnings.length === 0) return;
  const { c } = ui;
  ui.out();
  ui.out(`${c.yellow(SYMBOLS.warn)} ${plural(warnings.length, 'warning')} ${c.dim('(not blocking; use --strict to fail on warnings)')}`);
  for (const warning of warnings.slice(0, MAX_LISTED_WARNINGS)) {
    const where = location(warning);
    ui.out(c.dim(`  ${where ? `${where}  ` : ''}${firstLine(describe(warning))}`));
  }
  if (warnings.length > MAX_LISTED_WARNINGS) {
    ui.out(c.dim(`  … and ${warnings.length - MAX_LISTED_WARNINGS} more (see --json)`));
  }
}

function describe(diagnostic) {
  if (diagnostic.code && diagnostic.column != null) {
    return `${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
  }
  const lines = diagnostic.message.split(/\r?\n/);
  const shown = lines.slice(0, MAX_MESSAGE_LINES);
  if (lines.length > MAX_MESSAGE_LINES) shown.push('…');
  return shown.join('\n') || '(no message)';
}

function firstLine(text) {
  return text.split(/\r?\n/, 1)[0];
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function timeoutFromEnv() {
  const seconds = Number(process.env.UNITY_AGENT_TIMEOUT);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
