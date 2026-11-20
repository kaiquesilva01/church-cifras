import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_TITLE = 'release: develop -> main';

const MAX_LISTED = 40;

// logOutput: saída de `git log --first-parent --format=%T%x09%s origin/main..origin/develop`
// (mais recente primeiro). Para no primeiro commit cuja árvore é a da main: após um release
// com squash, a develop tinha exatamente o conteúdo da main naquele ponto, então ele e os
// anteriores já estão na main.
export function pendingSubjects(logOutput, mainTree) {
  const subjects = [];
  for (const line of logOutput.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    const tree = tab === -1 ? line.trim() : line.slice(0, tab);
    const subject = tab === -1 ? '' : line.slice(tab + 1);
    if (tree === mainTree) break;
    subjects.push(subject);
  }
  return subjects;
}

// Números de PR no fim de cada assunto (`feat: x (#97)`), sem repetição.
export function prNumbers(subjects) {
  const nums = subjects.map((s) => /\(#(\d+)\)$/.exec(s.trim())).filter(Boolean).map((m) => Number(m[1]));
  return [...new Set(nums)];
}

// Issues que o corpo do PR fecha (mesmas palavras-chave de closingRefs em git-guard-rules.mjs).
// "Parte de #N" não conta.
export function resolvedIssues(body) {
  const nums = [...body.matchAll(/\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+#(\d+)/gi)].map((m) =>
    Number(m[1]),
  );
  return [...new Set(nums)].sort((a, b) => a - b);
}

function subjectLines(subjects) {
  if (subjects.length === 0) {
    return ['- (não consegui listar os commits; confira a aba Commits do PR)'];
  }
  const lines = subjects.slice(0, MAX_LISTED).map((subject) => `- ${subject}`);
  const rest = subjects.length - MAX_LISTED;
  if (rest > 0) lines.push(`- …e mais ${rest} commit(s)`);
  return lines;
}

const INTRO =
  'Aberto automaticamente pelo hook de Stop (`.claude/hooks/release-pr.mjs`): ' +
  'o conteúdo de `develop` difere do de `main` e não havia PR de release aberto.';

const REVIEW_NOTE =
  'O agente faz o merge (`gh pr merge <n> --merge --match-head-commit <sha>`) depois de: ' +
  'CI verde, revisão e QA de cada entrega, fora da janela do culto (quinta e domingo a partir ' +
  'das 16h30) e sem incidente aberto. Mudanças nas travas já passaram pelo merge da pessoa na develop.';

const CHECKLIST = [
  '- [ ] CI verde (checks e e2e)',
  '- [ ] Code review feito em todos os PRs do release',
  '- [ ] UI: Paper atualizado e design system respeitado',
];

const MERGE_NOTE =
  'Use **Create a merge commit**. Não use *Squash and merge* nem *Rebase and merge*: ' +
  'a `main` ficaria com commits que a `develop` não tem, e o release seguinte exigiria ' +
  'um merge de volta (`chore: merge main into develop`).';

const FOOTER = '🤖 Generated with [Claude Code](https://claude.com/claude-code)';

export function buildReleaseBody(subjects, closes = []) {
  const fecha = closes.map((n) => `Closes #${n}`);
  return [
    INTRO,
    `## Entra neste release\n\n${subjectLines(subjects).join('\n')}`,
    ...(fecha.length > 0 ? [`## Fecha\n\n${fecha.join('\n')}`] : []),
    `## Travas\n\n${REVIEW_NOTE}\n\n${CHECKLIST.join('\n')}`,
    `## Como fazer o merge\n\n${MERGE_NOTE}`,
    FOOTER,
  ].join('\n\n');
}

function listPendingSubjects(run) {
  const tree = run('git', ['rev-parse', 'origin/main^{tree}']);
  const log = run('git', [
    'log',
    '--first-parent',
    '--format=%T%x09%s',
    'origin/main..origin/develop',
  ]);
  if (tree.status !== 0 || log.status !== 0) return [];
  return pendingSubjects(log.stdout, tree.stdout.trim());
}

// Uma única chamada: os PRs mergeados na develop trazem os corpos com `Closes #N`. Só entram os
// PRs deste release (prNumbers). Se a consulta falhar, não há `Closes` (nunca lança).
function resolveCloses(run, subjects) {
  const numbers = new Set(prNumbers(subjects));
  if (numbers.size === 0) return [];
  const listed = run('gh', [
    'pr',
    'list',
    '--base',
    'develop',
    '--state',
    'merged',
    '--json',
    'number,body',
    '--limit',
    '200',
  ]);
  if (listed.status !== 0) return [];
  let prs;
  try {
    prs = JSON.parse(listed.stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(prs)) return [];
  const closes = new Set();
  for (const pr of prs) {
    if (!numbers.has(pr?.number)) continue;
    for (const issue of resolvedIssues(pr.body ?? '')) closes.add(issue);
  }
  return [...closes].sort((a, b) => a - b);
}

// run(cmd, args) -> { status, stdout, stderr }, injetado (nunca lança).
export function checkRelease({ run, dryRun = false }) {
  const fetched = run('git', ['fetch', '--quiet', 'origin', 'main', 'develop']);
  if (fetched.status !== 0) return { action: 'none' };

  // Mesmo conteúdo (exit 0) ou erro (exit diferente de 1) -> nada a fazer.
  const diff = run('git', ['diff', '--quiet', 'origin/main', 'origin/develop']);
  if (diff.status !== 1) return { action: 'none' };

  const open = run('gh', [
    'pr',
    'list',
    '--base',
    'main',
    '--head',
    'develop',
    '--state',
    'open',
    '--json',
    'number',
    '--jq',
    'length',
  ]);
  if (open.status !== 0 || open.stdout.trim() !== '0') return { action: 'none' };

  const subjects = listPendingSubjects(run);
  if (dryRun) return { action: 'dry-run', subjects };

  const created = run('gh', [
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    'develop',
    '--title',
    RELEASE_TITLE,
    '--body',
    buildReleaseBody(subjects, resolveCloses(run, subjects)),
  ]);
  if (created.status === 0) {
    const lines = created.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return { action: 'created', url: lines.at(-1) ?? '' };
  }
  // Outra sessão (um worktree por sessão) abriu o PR entre o `gh pr list` e o `gh pr create`.
  if (/already exists/i.test(created.stderr)) return { action: 'none' };
  return { action: 'error', message: created.stderr.trim() || 'gh pr create falhou' };
}

function readInput() {
  try {
    const parsed = JSON.parse(readFileSync(0, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function runScriptMode() {
  const input = readInput();
  if (input.stop_hook_active === true) return;

  const cwd = input.cwd || process.cwd();
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      timeout: 20000,
      windowsHide: true,
    });
    return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };

  const dryRun = process.env.RELEASE_PR_DRY_RUN === '1';
  const result = checkRelease({ run, dryRun });

  let message = null;
  if (result.action === 'created') {
    message =
      `PR de release develop → main aberto: ${result.url}. ` +
      'Complete o corpo conforme AGENTS.md › "PR de release".';
  } else if (result.action === 'dry-run') {
    message =
      `[dry-run] abriria o PR develop → main com ${result.subjects.length} ` +
      'commit(s) pendente(s).';
  } else if (result.action === 'error') {
    message = `[release-pr] não consegui abrir o PR develop → main: ${result.message}`;
  }
  if (message) process.stdout.write(JSON.stringify({ systemMessage: message }));
}

// Executado como script (hook)? Compara caminhos reais; no Windows sem diferenciar maiúsculas.
const samePath = (a, b) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const isMain = (() => {
  try {
    const self = realpathSync(fileURLToPath(import.meta.url));
    return samePath(self, realpathSync(resolve(process.argv[1] ?? '')));
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    runScriptMode();
  } catch (err) {
    process.stderr.write(`[release-pr] aviso: ${err?.message ?? err}`);
  }
  // Sem process.exit: deixa o stdout drenar. Um Stop hook nunca bloqueia (exit 0).
  process.exitCode = 0;
}
