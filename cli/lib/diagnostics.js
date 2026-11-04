// Turns raw Unity console entries into structured compiler diagnostics.
//
// The Unity package reports every console entry that looks compile-related,
// which also catches compiler warnings and runtime logs from user scripts.
// Only compiler errors should fail a check, so entries are sorted here:
//   - "file(line,col): error CS1234: ..."   -> error
//   - "file(line,col): warning CS1234: ..." -> warning
//   - runtime logs (they carry a stack trace like "(at Assets/Foo.cs:12)") -> ignored
//   - anything else stays an error, so a real problem is never hidden.

const DIAGNOSTIC = /^(?<file>.+?)\((?<line>\d+),(?<column>\d+)\):\s*(?<severity>error|warning)\s+(?<code>[A-Z]+\d+):\s*(?<text>.*)$/;
const STACK_FRAME = /\(at [^()]+:\d+\)/;

export function parseEntry(entry) {
  const raw = String(entry?.Message ?? '').trim();
  const firstLine = raw.split(/\r?\n/, 1)[0].trim();

  const match = DIAGNOSTIC.exec(firstLine);
  if (match) {
    const { file, line, column, severity, code, text } = match.groups;
    return { severity, file, line: Number(line), column: Number(column), code, message: text, raw };
  }

  let severity = 'error';
  if (STACK_FRAME.test(raw)) severity = 'log';
  else if (/\bwarning CS\d+/.test(raw) && !/\berror\b/i.test(raw)) severity = 'warning';

  return {
    severity,
    file: entry?.File || null,
    line: Number(entry?.Line) || null,
    column: null,
    code: raw.match(/\b(CS\d{4})\b/)?.[1] ?? null,
    message: raw,
    raw,
  };
}

export function classify(entries) {
  const result = { errors: [], warnings: [], ignored: 0 };
  const seen = new Set();
  for (const entry of entries) {
    const diagnostic = parseEntry(entry);
    if (seen.has(diagnostic.raw)) continue;
    seen.add(diagnostic.raw);
    if (diagnostic.severity === 'error') result.errors.push(diagnostic);
    else if (diagnostic.severity === 'warning') result.warnings.push(diagnostic);
    else result.ignored++;
  }
  return result;
}

export function location(diagnostic) {
  if (!diagnostic.file) return null;
  return [diagnostic.file, diagnostic.line, diagnostic.column].filter((part) => part != null).join(':');
}
