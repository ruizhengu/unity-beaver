import { parseArgs } from 'node:util';
import { check } from './commands/check.js';
import { doctor } from './commands/doctor.js';
import { init } from './commands/init.js';
import { REPO_URL, VERSION } from './lib/constants.js';
import { createUI, SYMBOLS } from './lib/ui.js';

const COMMANDS = { check, doctor, init };

const OPTIONS = {
  json: { type: 'boolean' },
  strict: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  'no-color': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

export async function main(argv, io = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (err) {
    const ui = createUI(io);
    const option = err.message.match(/'([^']+)'/)?.[1];
    ui.err(`${ui.ce.red(SYMBOLS.fail)} ${option ? `Unknown option: ${option}` : err.message}`);
    ui.err(`  Run ${ui.ce.cyan('unity-beaver --help')} to see what's available.`);
    return 2;
  }

  const { values: options, positionals } = parsed;
  const ui = createUI({ ...io, noColor: options['no-color'] });
  const [name, ...rest] = positionals;

  if (options.version) {
    ui.out(`unity-beaver ${VERSION}`);
    return 0;
  }
  if (options.help || !name || name === 'help') {
    printHelp(ui);
    return 0;
  }

  const command = COMMANDS[name];
  if (!command) {
    const guess = suggest(name, Object.keys(COMMANDS));
    ui.err(`${ui.ce.red(SYMBOLS.fail)} Unknown command: ${name}${guess ? `. Did you mean ${ui.ce.cyan(guess)}?` : ''}`);
    ui.err(`  Run ${ui.ce.cyan('unity-beaver --help')} to see all commands.`);
    return 2;
  }
  return command({ ...options, path: rest[0] }, ui);
}

function printHelp(ui) {
  const { c } = ui;
  const rows = (items) => items.map(([left, right]) => `  ${c.cyan(left.padEnd(18))}${right}`).join('\n');
  ui.out(`${c.bold('unity-beaver')} ${c.dim(VERSION)}
Let AI coding agents compile-check C# in the running Unity Editor.

${c.bold('Usage')}
  unity-beaver <command> [options]
  ub <command> [options]            ${c.dim('# short name, same commands')}

${c.bold('Commands')}
${rows([
  ['check', 'Recompile in Unity and report errors'],
  ['doctor', 'Find out why the CLI and Unity aren\'t talking'],
  ['init [path]', 'Set up a Unity project: Unity package + agent instructions'],
])}

${c.bold('Options')}
${rows([
  ['--json', 'Machine-readable output (check, doctor)'],
  ['--strict', 'Fail on compiler warnings too (check)'],
  ['--dry-run', 'Show what would change without writing (init)'],
  ['--no-color', 'Plain output (NO_COLOR works too)'],
  ['-h, --help', 'Show this help'],
  ['-v, --version', 'Show the version'],
])}

${c.bold('Exit codes')} ${c.dim('(check)')}
  0 compiled · 1 compile errors · 2 couldn't reach Unity

${c.bold('Examples')}
  unity-beaver init              ${c.dim('# run once in your Unity project folder')}
  unity-beaver check             ${c.dim('# after editing .cs files')}
  unity-beaver check --json      ${c.dim('# structured errors for scripts and agents')}

${c.dim(`Docs: ${REPO_URL}`)}`);
}

function suggest(input, candidates) {
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = current;
      }
    }
    return row[b.length];
  };
  const best = candidates.map((name) => [name, distance(input.toLowerCase(), name)]).sort((x, y) => x[1] - y[1])[0];
  return best && best[1] <= 2 ? best[0] : null;
}
