import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classify, location, parseEntry } from '../cli/lib/diagnostics.js';
import { SAMPLE_ERRORS } from './helpers/mock-unity.js';

describe('parseEntry', () => {
  it('parses a compiler error', () => {
    assert.deepEqual(parseEntry(SAMPLE_ERRORS[0]), {
      severity: 'error',
      file: 'Assets/Scripts/PlayerController.cs',
      line: 15,
      column: 10,
      code: 'CS1002',
      message: '; expected',
      raw: SAMPLE_ERRORS[0].Message,
    });
  });

  it('parses a compiler warning', () => {
    const parsed = parseEntry(SAMPLE_ERRORS[2]);
    assert.equal(parsed.severity, 'warning');
    assert.equal(parsed.code, 'CS0414');
  });

  it('ignores runtime logs that carry a stack trace', () => {
    const entry = {
      File: 'Assets/Scripts/Player.cs',
      Line: 8,
      Message: 'Player spawned\nUnityEngine.Debug:Log (object)\nPlayer:Start () (at Assets/Scripts/Player.cs:8)',
    };
    assert.equal(parseEntry(entry).severity, 'log');
  });

  it('keeps anything unrecognised as an error, with the server-reported location', () => {
    const entry = { File: 'Assets/Game.asmdef', Line: 0, Message: "Assembly 'Game' has a reference to a missing assembly" };
    const parsed = parseEntry(entry);
    assert.equal(parsed.severity, 'error');
    assert.equal(parsed.file, 'Assets/Game.asmdef');
    assert.equal(parsed.line, null);
    assert.equal(location(parsed), 'Assets/Game.asmdef');
  });

  it('tolerates missing fields', () => {
    assert.equal(parseEntry({}).severity, 'error');
    assert.equal(parseEntry(null).message, '');
  });
});

describe('classify', () => {
  it('splits errors from warnings and drops duplicates and runtime logs', () => {
    const log = { File: 'Assets/A.cs', Line: 1, Message: 'hi\nA:Start () (at Assets/A.cs:1)' };
    const result = classify([...SAMPLE_ERRORS, SAMPLE_ERRORS[0], log]);
    assert.deepEqual(result.errors.map(location), ['Assets/Scripts/PlayerController.cs:15:10', 'Assets/Scripts/SceneLoader.cs:12:9']);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.ignored, 1);
  });
});
