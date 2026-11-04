// Terminal output helpers: colors that respect NO_COLOR / non-TTY, and a
// spinner that only appears for humans (never in pipes, CI, or agent shells).

export const SYMBOLS = { ok: '✓', fail: '✗', warn: '⚠', skip: '◎', arrow: '→' };

export function shouldColor(stream, env = process.env, disabled = false) {
  if (disabled || 'NO_COLOR' in env || env.TERM === 'dumb') return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return Boolean(stream && stream.isTTY);
}

export function palette(enabled) {
  const wrap = (open, close) => (text) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : String(text));
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
  };
}

export function createUI({ stdout = process.stdout, stderr = process.stderr, env = process.env, noColor = false } = {}) {
  const c = palette(shouldColor(stdout, env, noColor));
  const ce = palette(shouldColor(stderr, env, noColor));
  const showSpinner = Boolean(stderr.isTTY) && !env.CI && env.TERM !== 'dumb';

  return {
    c, // colors for stdout
    ce, // colors for stderr
    out: (line = '') => stdout.write(`${line}\n`),
    err: (line = '') => stderr.write(`${line}\n`),
    spinner: (text) => (showSpinner ? startSpinner(stderr, text, ce) : silentSpinner()),
  };
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function startSpinner(stream, initialText, c) {
  const started = Date.now();
  let text = initialText;
  let frame = 0;
  const render = () => {
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    stream.write(`\r\x1b[2K${c.cyan(FRAMES[frame++ % FRAMES.length])} ${text} ${c.dim(`${seconds}s`)}`);
  };
  render();
  const timer = setInterval(render, 80);
  timer.unref();
  return {
    update(next) {
      text = next;
    },
    stop() {
      clearInterval(timer);
      stream.write('\r\x1b[2K');
    },
  };
}

function silentSpinner() {
  return { update() {}, stop() {} };
}

export function formatDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
