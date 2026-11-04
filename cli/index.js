#!/usr/bin/env node
import { main } from './main.js';

// Wait for stdout/stderr to flush before exiting so piped output is never cut off.
function exit(code) {
  let pending = 2;
  const done = () => --pending === 0 && process.exit(code);
  process.stdout.write('', done);
  process.stderr.write('', done);
}

main(process.argv.slice(2)).then(exit, (err) => {
  process.stderr.write(`✗ Unexpected error: ${err?.stack || err}\n`);
  exit(2);
});
