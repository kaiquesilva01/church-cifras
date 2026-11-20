import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKER, originalText, spliceAnalysis } from './analise.mjs';

const SECTION = '## Análise Agêntica\nx';

test('keeps the original text byte for byte', () => {
  const bodies = ['A notificação…\nlinha 2', 'a\r\nb\r\n', 'texto\n\n---\n\nmais texto', ''];
  for (const b of bodies) {
    assert.equal(originalText(spliceAnalysis(b, SECTION)), b.trimEnd(), `corpo: ${JSON.stringify(b)}`);
  }
});

test('replaces an existing section instead of appending', () => {
  const once = spliceAnalysis('texto original', '## Análise Agêntica\nprimeira');
  const twice = spliceAnalysis(once, '## Análise Agêntica\nsegunda');
  assert.equal(twice.split(MARKER).length - 1, 1);
  assert.ok(twice.includes('segunda'));
  assert.ok(!twice.includes('primeira'));
  assert.equal(originalText(twice), 'texto original');
});

test('is idempotent', () => {
  const b = 'texto da issue\r\nlinha 2';
  assert.equal(spliceAnalysis(spliceAnalysis(b, SECTION), SECTION), spliceAnalysis(b, SECTION));
});

test('starts with the separator when the original body is empty', () => {
  assert.ok(spliceAnalysis('', SECTION).startsWith('---\n'));
});

test('throws past the GitHub body limit', () => {
  assert.throws(() => spliceAnalysis('a', 'x'.repeat(70000)), /65\.536/);
});
