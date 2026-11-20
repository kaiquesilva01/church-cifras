import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const PAPER_ID = '01M7BN04NKJ00S1T4XVC8HRGRS';

test('the design system doc exists and names the Paper file', () => {
  assert.ok(existsSync(join(root, 'docs/design-system.md')));
  assert.ok(read('docs/design-system.md').includes(PAPER_ID));
});

test('AGENTS.md points to the design system and to keeping Paper updated', () => {
  const agents = read('AGENTS.md');
  assert.ok(agents.includes('docs/design-system.md'));
  assert.ok(agents.includes(PAPER_ID));
  assert.match(agents, /Mantenha o Paper\s+atualizado/);
});

test('designer, frontend-dev and code-reviewer know the design system', () => {
  for (const name of ['designer', 'frontend-dev', 'code-reviewer']) {
    const text = read(`.claude/agents/${name}.md`);
    assert.ok(text.includes('docs/design-system.md'), `${name}: sem docs/design-system.md`);
  }
  assert.match(read('.claude/agents/designer.md'), /Manter o Paper atualizado/);
});

test('the PR template asks about the design system and Paper', () => {
  const template = read('.github/pull_request_template.md');
  assert.ok(template.includes('design-system.md'));
  assert.ok(template.includes('Paper'));
});

test('the PR template links the issue, asks about the phone test and the review labels', () => {
  const template = read('.github/pull_request_template.md');
  assert.ok(template.includes('Resolve #'), 'template sem a linha Resolve #N / Parte de #N');
  assert.ok(template.includes('Teste no celular'), 'template sem o item de teste no celular');
  assert.ok(template.includes('Etiquetas revisado e qa-ok'), 'template sem as etiquetas revisado e qa-ok');
  assert.ok(!template.includes('Revisado pelo code-reviewer'), 'template ainda pede "Revisado pelo code-reviewer"');
});

test('every color token of styles.css is documented in the design system', () => {
  const css = read('apps/web/src/ui/styles.css');
  const doc = read('docs/design-system.md');
  const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  const tokens = [...rootBlock.matchAll(/^\s*(--(?:color|shadow)-[a-z-]+):/gm)].map((m) => m[1]);
  assert.ok(tokens.length > 15, 'tokens não encontrados');
  for (const token of tokens) {
    assert.ok(doc.includes(token), `${token} não está documentado em docs/design-system.md`);
  }
});
