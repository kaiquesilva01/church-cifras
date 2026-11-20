import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKER } from './analise.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const skillPath = join(dir, 'SKILL.md');

function load() {
  assert.ok(existsSync(skillPath), 'SKILL.md não existe');
  return readFileSync(skillPath, 'utf8').replace(/\r\n/g, '\n');
}

function split(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, 'frontmatter ausente');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fm, body: m[2] };
}

// Linhas de tabela markdown viram células, sem as bordas vazias.
function rows(body) {
  return body
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

const text = load();
const { fm, body } = split(text);

test('frontmatter: name e description com os gatilhos', () => {
  assert.equal(fm.name, 'entregar-issue');
  assert.ok(fm.description, 'description ausente ou em mais de uma linha');
  for (const gatilho of ['desenvolve a #', 'continua a #', 'publica a #']) {
    assert.ok(fm.description.includes(gatilho), `description sem "${gatilho}"`);
  }
});

test('tem menos de 300 linhas', () => {
  assert.ok(text.split('\n').length < 300, 'SKILL.md passa de 300 linhas');
});

test('usa o MARKER de analise.mjs e chama o CLI para gravar a issue', () => {
  assert.ok(body.includes(MARKER), 'MARKER de analise.mjs ausente');
  assert.ok(
    body.includes('node .claude/skills/entregar-issue/analise.mjs <n> <arquivo.md>'),
    'chamada do CLI analise.mjs ausente',
  );
  assert.ok(body.includes('Só o orquestrador escreve na issue'), 'frase de autoria ausente');
});

test('lista os 7 gatilhos de parada de §5.1', () => {
  for (const g of [
    'dado novo sobre pessoas',
    'papel',
    'custo',
    'passo manual',
    'não-objetivo',
    'sem volta',
    'travas',
  ]) {
    assert.ok(body.includes(g), `gatilho "${g}" ausente`);
  }
});

test('cita as 7 etiquetas do fluxo', () => {
  for (const l of [
    'revisado',
    'qa-ok',
    'teste-celular-ok',
    'no-site-teste',
    'aguardando-voce',
    'em-andamento',
    'incidente',
  ]) {
    assert.ok(body.includes(l), `etiqueta "${l}" ausente`);
  }
});

test('traz os comandos e termos de Git, janela, celular e produção', () => {
  for (const t of [
    '16h30',
    '--match-head-commit',
    'site-teste.yml',
    '--ref main',
    'PushNotification',
    'docs/sistema.md',
    'gh pr merge <n> --squash --delete-branch',
    'gh pr checks <n> --watch',
    'gh pr merge <n> --merge --match-head-commit <sha>',
    'gh run watch',
    'gh workflow run site-teste.yml --ref main -f branch=<branch> -f issue=<n>',
  ]) {
    assert.ok(body.includes(t), `termo "${t}" ausente`);
  }
});

test('tabela de modelos tem uma linha por papel de §5.3 com modelo e effort', () => {
  const table = rows(body);
  const expected = [
    ['Orquestrador', 'Sonnet', 'medium'],
    ['product-owner', 'Sonnet', 'medium'],
    ['designer', 'Sonnet', 'medium'],
    ['tech-lead', 'Haiku', 'high'],
    ['pré-voo', 'Haiku', 'high'],
    ['implementação', 'Haiku', 'low'],
    ['qa', 'Haiku', 'low'],
    ['Conferência por tarefa', 'Haiku', 'high'],
    ['Correção após revisão ou QA', 'Haiku', 'medium'],
    ['Correção após 2 falhas', 'Sonnet', 'high'],
    ['code-reviewer', 'Sonnet', 'high'],
  ];
  for (const [papel, modelo, effort] of expected) {
    const found = table.some(
      (c) =>
        c.length >= 3 &&
        c[0].toLowerCase().includes(papel.toLowerCase()) &&
        c[1].includes(modelo) &&
        c[2].includes(effort),
    );
    assert.ok(found, `linha da tabela de modelos ausente: ${papel} | ${modelo} | ${effort}`);
  }
});

test('Opus aparece só ligado a incidente', () => {
  assert.ok(
    body.split('\n').some((l) => l.includes('Opus') && l.includes('incidente')),
    'Opus precisa estar atrelado a incidente de produção',
  );
});
