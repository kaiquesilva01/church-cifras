import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MARKER, originalText, spliceAnalysis } from './analise.mjs';

const SECTION = '## Análise Agêntica\nx';
const SCRIPT = fileURLToPath(new URL('./analise.mjs', import.meta.url));

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

test('keeps an original text that pastes the MARKER, up to the tool marker', () => {
  const pasted = `texto\n---\n${MARKER}\nlixo final`;
  const written = spliceAnalysis('texto', SECTION);
  // Humano colou o marcador no texto original depois que a ferramenta já gravou.
  const edited = `${pasted}\n\n---\n${MARKER}\n${SECTION}\n`;
  assert.equal(originalText(edited), pasted.trimEnd());
  assert.equal(originalText(spliceAnalysis(edited, SECTION)), pasted.trimEnd());
  assert.ok(originalText(written) === 'texto');
});

test('finds the original text when the separator is CRLF', () => {
  assert.equal(originalText(`texto\r\n---\r\n${MARKER}\nx`), 'texto');
});

test('throws when the section contains the MARKER', () => {
  assert.throws(() => spliceAnalysis('a', `x\n${MARKER}\ny`), /marcador/);
});

test('reports a missing section file without blaming gh', () => {
  const missing = join(tmpdir(), 'analise-inexistente-xyz.md');
  const r = spawnSync(process.execPath, [SCRIPT, '1', missing], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /arquivo não encontrado/);
  assert.doesNotMatch(r.stderr, /gh não encontrado/);
});
