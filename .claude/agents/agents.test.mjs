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

const SDLC_TABLE = {
  'product-owner': { model: 'sonnet', effort: 'medium' },
  designer: { model: 'sonnet', effort: 'medium' },
  'tech-lead': { model: 'haiku', effort: 'high' },
  'frontend-dev': { model: 'haiku', effort: 'low' },
  'backend-dev': { model: 'haiku', effort: 'low' },
  qa: { model: 'haiku', effort: 'low' },
  'code-reviewer': { model: 'sonnet', effort: 'high' },
};

test('every agent runs on the model and effort of the SDLC table', () => {
  for (const [n, want] of Object.entries(SDLC_TABLE)) {
    const { fm } = parse(n);
    assert.equal(fm.model, want.model, `${n}: model`);
    assert.equal(fm.effort, want.effort, `${n}: effort`);
  }
});

test('no agent runs on opus', () => {
  for (const n of NAMES) {
    assert.notEqual(parse(n).fm.model, 'opus', `${n}: opus`);
  }
});

test('every agent leaves the issue to the orchestrator', () => {
  for (const n of NAMES) {
    assert.ok(parse(n).body.includes('orquestrador escreve na issue'), `${n}: sem regra da issue`);
  }
});

test('every agent knows its step in entregar-issue', () => {
  for (const n of NAMES) {
    assert.ok(parse(n).body.includes('entregar-issue'), `${n}: sem entregar-issue`);
  }
});

test('every agent states the merge rule with the git-guard', () => {
  for (const n of NAMES) {
    const { body } = parse(n);
    assert.ok(
      body.includes(
        'subagentes nunca fazem merge; o orquestrador faz o merge com as travas do git-guard, e mudanças nas travas ficam com a pessoa',
      ),
      `${n}: regra de merge antiga ou ausente`,
    );
    assert.ok(!body.includes('merge é do orquestrador para develop'), `${n}: linha antiga de merge`);
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

test('agents with tool allowlists can load skills', () => {
  for (const n of NAMES) {
    const { fm } = parse(n);
    if (fm.tools) assert.match(fm.tools, /\bSkill\b/, `${n}: tools sem Skill`);
  }
});
