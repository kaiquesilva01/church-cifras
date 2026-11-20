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

// Trecho que começa no título dado e vai até o próximo título de mesmo nível ou acima.
function section(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  assert.ok(start !== -1, `seção "${heading}" ausente`);
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6}) /);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

// Linhas de tabela markdown viram células, sem as bordas vazias.
function rows(text) {
  return text
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

// Verdadeiro se alguma linha do trecho contém todos os termos.
const hasLine = (text, terms) =>
  text.split('\n').some((l) => terms.every((t) => l.includes(t)));

const text = load();
const { fm, body } = split(text);
const sec = (heading) => section(body, heading);

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

test('usa o MARKER de analise.mjs, chama o CLI e nunca regrava o corpo com gh issue edit --body', () => {
  assert.ok(body.includes(MARKER), 'MARKER de analise.mjs ausente');
  assert.ok(
    body.includes('node .claude/skills/entregar-issue/analise.mjs <n> <arquivo.md>'),
    'chamada do CLI analise.mjs ausente',
  );
  assert.ok(body.includes('Só o orquestrador escreve na issue'), 'frase de autoria ausente');
  assert.ok(
    hasLine(sec('## Regras que não se quebram'), ['gh issue edit --body', 'Nunca']),
    'falta a proibição de gh issue edit --body',
  );
});

test('cada gatilho de §5.1 é o item numerado de mesmo número', () => {
  const items = sec('## Gatilhos').split('\n').filter((l) => /^\d\. /.test(l));
  const keys = [
    'dado novo sobre pessoas',
    'papel',
    'custo',
    'passo manual',
    'não-objetivo',
    'sem volta',
    'travas',
  ];
  assert.equal(items.length, 7, 'a lista de gatilhos precisa ter 7 itens numerados');
  keys.forEach((k, i) => assert.ok(items[i].includes(k), `item ${i + 1} não traz "${k}"`));
});

test('a seção de gatilhos traz aguardando-voce e PushNotification como sinais de pausa', () => {
  const g = sec('## Gatilhos');
  assert.ok(g.includes('aguardando-voce'), 'seção de gatilhos sem aguardando-voce');
  assert.ok(g.includes('PushNotification'), 'seção de gatilhos sem PushNotification');
  assert.ok(g.includes('Três sinais'), 'falta a lista dos sinais de pausa');
});

test('a resposta da pessoa e os sinais de pausa são linhas separadas', () => {
  const lines = sec('## Gatilhos').split('\n');
  const sinais = lines.findIndex((l) => l.includes('Três sinais'));
  assert.ok(sinais !== -1, 'falta a linha "Três sinais"');
  assert.ok(
    lines.slice(sinais + 1).some((l) => l.includes('A resposta vem no chat')),
    'a resposta da pessoa deve vir em linha própria, depois dos sinais',
  );
  assert.ok(!lines[sinais].includes('A resposta vem'), 'bullets fundidos na mesma linha');
});

test('a worktree só é exigida a partir da etapa 3, com as etapas 1 e 2 sem escrita', () => {
  const r = sec('## Regras que não se quebram');
  assert.ok(r.includes('A partir da etapa 3'), 'falta o marco da etapa 3');
  assert.ok(r.includes('só leem o repositório'), 'falta a regra de leitura nas etapas 1 e 2');
});

test('etiquetas aparecem na etapa que as usa', () => {
  const casos = [
    ['## Etapa 0', ['em-andamento']],
    ['### Antes de entrar na develop', ['revisado', 'qa-ok', 'teste-celular-ok']],
    ['## Teste no celular', ['no-site-teste']],
    ['## Gatilhos', ['aguardando-voce']],
    ['## Produção e incidente', ['incidente']],
  ];
  for (const [heading, labels] of casos) {
    for (const l of labels) assert.ok(sec(heading).includes(l), `"${l}" ausente em ${heading}`);
  }
});

test('comandos de Git ficam na seção que os executa', () => {
  const casos = [
    ['### Antes de entrar na develop', ['gh pr merge <n> --squash --delete-branch', 'gh pr checks <n> --watch']],
    ['### Release', ['gh pr merge <n> --merge --match-head-commit <sha>', 'gh pr view <n> --json headRefOid -q .headRefOid']],
    ['### 1. Negócio e experiência', ['docs/sistema.md']],
  ];
  for (const [heading, terms] of casos) {
    for (const t of terms) assert.ok(sec(heading).includes(t), `"${t}" ausente em ${heading}`);
  }
});

test('release: merge commit com SHA e nenhuma outra forma de merge', () => {
  const r = sec('### Release');
  assert.ok(r.includes('--merge --match-head-commit'), 'falta --merge --match-head-commit');
  for (const f of ['--squash', '--rebase', '--auto']) {
    assert.ok(!r.includes(f), `o release cita ${f}`);
  }
});

test('release: Closes da sub-issue, da mãe (só na última entrega) e do incidente', () => {
  const r = sec('### Release');
  assert.ok(r.includes('Closes #<incidente>'), 'falta Closes #<incidente>');
  assert.ok(r.includes('Closes #<mãe>') && r.includes('última entrega'), 'falta a regra da issue-mãe');
  assert.ok(r.includes('Closes #<sub>'), 'falta Closes #<sub> da sub-issue');
});

test('release: checklist do PR de release do AGENTS.md e corpo com risco e rollback', () => {
  const r = sec('### Release');
  for (const t of [
    'npm test',
    'npm run lint',
    'npm run typecheck',
    'npm run build',
    'npm run test:harness',
    'npm run test:rules',
    'risco',
    'rollback',
    'Rules, índices ou variáveis',
    'ficou de fora',
    'code-reviewer',
    'pendência crítica',
    'Paper',
    'design system',
    'mergeados na develop',
  ]) {
    assert.ok(r.includes(t), `release sem "${t}"`);
  }
});

test('release: recalcula os Closes a partir dos PRs mergeados na develop antes do merge', () => {
  const r = sec('### Release');
  assert.ok(r.includes('gh pr list --base develop --state merged'), 'falta a busca dos PRs mergeados na develop');
  assert.ok(r.includes('gh pr edit <n> --body-file'), 'falta gh pr edit --body-file para atualizar o corpo do release');
});

test('release: janela registrada na Análise, sem nova tentativa', () => {
  const r = sec('### Release');
  assert.ok(r.includes('Release aguardando a janela'), 'falta o registro da janela');
  assert.ok(r.includes('sem nova tentativa'), 'falta a proibição de tentar de novo');
});

test('janela do culto: limite de 16h30 a 23h59 e comandos para ler a hora', () => {
  const j = sec('## Janela do culto');
  for (const t of ['16h30', '23h59', 'TZ=America/Sao_Paulo date', 'ConvertTimeBySystemTimeZoneId']) {
    assert.ok(j.includes(t), `janela sem "${t}"`);
  }
});

test('teste no celular: site fixo, fila, pré-condição e aviso de dados de produção', () => {
  const t = sec('## Teste no celular');
  for (const x of [
    'https://louvor-hajaluz-teste.web.app',
    'gh workflow run site-teste.yml --ref main -f branch=<branch> -f issue=<n>',
    'gh workflow view site-teste.yml',
    'passo manual seu',
    'O site de teste usa os dados de produção: não crie, altere nem apague dados reais além do que o roteiro pede.',
  ]) {
    assert.ok(t.includes(x), `teste no celular sem "${x}"`);
  }
});

test('produção: monitoramento por headSha, log do aviso de deploy ignorado e sem deploy', () => {
  const p = sec('## Produção e incidente');
  for (const x of [
    'headSha',
    'mergeCommit',
    'gh run watch',
    'gh run view <id> --log',
    'Deploy ignorado: produção ainda não configurada',
    'sem deploy (só harness/docs)',
  ]) {
    assert.ok(p.includes(x), `produção sem "${x}"`);
  }
});

test('incidente sem culpado: rerun único com --failed, só no head da main, e fechamento com evidência', () => {
  const p = sec('## Produção e incidente');
  for (const x of ['gh run rerun', '--failed', 'headSha', 'gh issue close', 'aguardando-voce']) {
    assert.ok(p.includes(x), `incidente sem culpado sem "${x}"`);
  }
});

test('merge na develop: a exceção chore/merge-main-into-develop usa --merge', () => {
  const m = sec('### Antes de entrar na develop');
  assert.ok(m.includes('chore/merge-main-into-develop'), 'falta a exceção chore/merge-main-into-develop');
  assert.ok(hasLine(m, ['chore/merge-main-into-develop', '--merge']), 'a exceção não traz --merge');
});

test('merge na develop: se o comando falhar, confere o estado do PR antes de limpar a worktree', () => {
  const m = sec('### Antes de entrar na develop');
  assert.ok(m.includes('gh pr view <n> --json state -q .state'), 'falta a checagem do estado do PR');
  assert.ok(m.includes('MERGED'), 'falta o sinal MERGED');
});

test('janela: hora com %u (independente do idioma), 4 quinta e 7 domingo', () => {
  const j = sec('## Janela do culto');
  assert.ok(j.includes("TZ=America/Sao_Paulo date '+%u %H:%M'"), 'janela sem o date com %u');
  assert.ok(!j.includes("'+%a"), 'janela ainda usa %a (depende do idioma)');
  assert.ok(j.includes('4 é quinta') && j.includes('7 é domingo'), 'falta a legenda 4 = quinta, 7 = domingo');
});

test('teste no celular: o "ok" é registrado na Análise antes da etiqueta teste-celular-ok', () => {
  const t = sec('## Teste no celular');
  const line = t.split('\n').find((l) => l.includes('"ok" da pessoa'));
  assert.ok(line, 'falta o passo do "ok" da pessoa');
  assert.ok(line.indexOf('Decisões') < line.indexOf('--add-label teste-celular-ok'), 'o ok deve ser registrado antes da etiqueta');
});

test('incidente: reversão em fix/<incidente>-reverte-, reabertura e Closes do incidente', () => {
  const p = sec('## Produção e incidente');
  for (const x of ['fix/<incidente>-reverte-', 'gh issue reopen', 'Closes #<incidente>']) {
    assert.ok(p.includes(x), `incidente sem "${x}"`);
  }
});

test('regras: worktree com caminho absoluto em toda chamada ao Agent', () => {
  assert.ok(
    sec('## Regras que não se quebram').includes('caminho absoluto da worktree'),
    'falta a regra do caminho absoluto da worktree',
  );
});

test('tabela de modelos: uma linha por papel de §5.3 com modelo e effort', () => {
  const table = rows(sec('## Modelos e esforço (§5.3)'));
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

test('parâmetros do Agent: mapeamento e overrides do code-reviewer', () => {
  const m = sec('## Modelos e esforço (§5.3)');
  assert.ok(m.includes('model: "haiku" | "sonnet" | "opus"'), 'falta o mapeamento de model');
  assert.ok(m.includes('effort: "low" | "medium" | "high"'), 'falta o mapeamento de effort');
  assert.ok(hasLine(m, ['code-reviewer', 'model: "haiku"', 'effort: "high"']), 'falta a conferência do code-reviewer');
  assert.ok(hasLine(m, ['code-reviewer', 'model: "sonnet"', 'effort: "high"']), 'falta a revisão final do code-reviewer');
});

test('Opus aparece só ligado a incidente', () => {
  assert.ok(hasLine(sec('## Modelos e esforço (§5.3)'), ['Opus', 'incidente']));
});
