import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const NAMES = [
  'product-owner',
  'designer',
  'tech-lead',
  'frontend-dev',
  'backend-dev',
  'qa',
  'code-reviewer',
];

function parse(name) {
  const text = readFileSync(join(dir, `${name}.md`), 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${name}: frontmatter ausente`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fm, body: m[2] };
}

test('has the seven agents', () => {
  for (const n of NAMES) {
    assert.ok(existsSync(join(dir, `${n}.md`)), `${n}.md não existe`);
  }
});

test('every agent has name matching file and a description', () => {
  for (const n of NAMES) {
    const { fm } = parse(n);
    assert.equal(fm.name, n);
    assert.ok((fm.description ?? '').length >= 40, `${n}: description curta`);
  }
});

test('implementers run on sonnet medium', () => {
  for (const n of ['frontend-dev', 'backend-dev', 'qa']) {
    const { fm } = parse(n);
    assert.equal(fm.model, 'sonnet');
    assert.equal(fm.effort, 'medium');
  }
});

test('every agent points to AGENTS.md', () => {
  for (const n of NAMES) {
    assert.ok(parse(n).body.includes('AGENTS.md'), `${n}: sem AGENTS.md`);
  }
});

test('reviewer cannot edit', () => {
  const { fm } = parse('code-reviewer');
  assert.ok(fm.tools, 'code-reviewer precisa declarar tools');
  assert.ok(!/\bWrite\b/.test(fm.tools));
  assert.ok(!/\bEdit\b/.test(fm.tools));
});
