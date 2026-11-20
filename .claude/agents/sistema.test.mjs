import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = join(root, 'docs/sistema.md');
const read = () => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const HEADINGS = [
  '## Telas',
  '## Papéis e permissões',
  '## Dados',
  '## Functions e jobs',
  '## Storage, pad e PWA',
  '## Não-objetivos decididos',
  '## Limites conhecidos e pendências',
];

test('docs/sistema.md exists and has at most 350 lines', () => {
  assert.ok(existsSync(file));
  const lines = read().replace(/\n$/, '').split('\n').length;
  assert.ok(lines <= 350, `${lines} linhas (máximo 350)`);
});

test('docs/sistema.md has the required headings in order', () => {
  const text = read();
  let last = -1;
  for (const heading of HEADINGS) {
    const at = text.split('\n').indexOf(heading);
    assert.ok(at > last, `título ausente ou fora de ordem: ${heading}`);
    last = at;
  }
});

test('non-goals link to the repertórios spec section 3', () => {
  const text = read();
  assert.ok(text.includes('2026-11-16-repertorios-design.md'));
  assert.match(text, /Notificação push, escala de músicos\/líder, comentários/);
});
