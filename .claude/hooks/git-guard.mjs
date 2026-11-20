import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// `gh pr merge` em qualquer forma (inclusive `gh -R o/r pr merge`): falha da avaliação bloqueia.
const MERGE_RE = /\bgh\b[\s\S]*\bpr\s+merge\b/;

const RULES_PATH = '.claude/hooks/git-guard-rules.mjs';
const DEVELOP_RULES_MSG =
  'Não consegui carregar as regras da origin/develop (rode `git fetch origin develop`); merge bloqueado.';
const GH_TIMEOUT = 15000;
const PR_FIELDS = 'baseRefName,headRefName,headRefOid,statusCheckRollup,labels,changedFiles,body';

// Regras da origin/develop: um merge não é avaliado pelas regras do próprio branch (que poderiam ter sido afrouxadas).
// Devolve null se não der para ler ou importar; o chamador bloqueia.
async function loadDevelopRules(cwd) {
  let dir = null;
  try {
    const source = execFileSync('git', ['show', `origin/develop:${RULES_PATH}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    dir = mkdtempSync(join(tmpdir(), 'git-guard-rules-'));
    const file = join(dir, 'git-guard-rules.mjs');
    writeFileSync(file, source);
    return await import(pathToFileURL(file).href);
  } catch {
    return null;
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

let command = '';
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const raw = input?.tool_input?.command ?? '';
  if (typeof raw !== 'string' || !/\b(git|gh|firebase)\b/.test(raw)) process.exit(0);
  command = raw;

  const cwd = input.cwd || process.cwd();
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  // -z + quotePath=false: nomes com acentos/espaços chegam crus, separados por NUL.
  const stagedFiles = git(['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only', '-z'])
    .split('\0')
    .filter(Boolean);

  const rules = /\bgh\b/.test(command) && /\bmerge\b/.test(command)
    ? await loadDevelopRules(cwd)
    : await import('./git-guard-rules.mjs');
  if (!rules) {
    process.stderr.write('[git-guard] ' + DEVELOP_RULES_MSG);
    process.exit(2);
  }

  const ghOpts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GH_TIMEOUT };

  // Preenchido quando `gh pr diff` traz menos arquivos que o PR: a mensagem de bloqueio fica específica.
  let incomplete = null;

  // Chamado só em `gh pr merge`; qualquer falha ou dado incompleto -> null (o guard bloqueia).
  const resolvePr = (target, repo) => {
    try {
      const repoArgs = repo ? ['-R', repo] : [];
      const pr = JSON.parse(execFileSync('gh', ['pr', 'view', target, ...repoArgs, '--json', PR_FIELDS], ghOpts));
      // `gh pr diff --name-only` lista todos os arquivos (sem o limite de 100 de `gh pr view`).
      const files = execFileSync('gh', ['pr', 'diff', target, ...repoArgs, '--name-only'], ghOpts)
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
      if (files.length !== pr.changedFiles) {
        incomplete = { listed: files.length, total: pr.changedFiles };
        return null;
      }
      if (!Array.isArray(pr.statusCheckRollup) || !Array.isArray(pr.labels)) return null;
      return {
        base: pr.baseRefName,
        head: pr.headRefName,
        headSha: pr.headRefOid,
        checks: pr.statusCheckRollup.map((c) => ({
          name: c.name ?? c.context,
          status: c.status,
          conclusion: c.conclusion,
          state: c.state,
        })),
        labels: pr.labels.map((l) => l.name),
        files,
        body: pr.body ?? '',
      };
    } catch {
      return null;
    }
  };

  // Issues abertas com a etiqueta `incidente`; null se a consulta falhar (o release fica bloqueado).
  const openIncidents = () => {
    try {
      const issues = JSON.parse(
        execFileSync('gh', ['issue', 'list', '--label', 'incidente', '--state', 'open', '--json', 'number'], ghOpts),
      );
      return Array.isArray(issues) && issues.every((i) => Number.isInteger(i?.number))
        ? issues.map((i) => i.number)
        : null;
    } catch {
      return null;
    }
  };

  // GIT_GUARD_NOW (ISO) fixa o relógio nos testes; o ambiente vem do Claude Code, não do comando.
  const now = () => new Date(process.env.GIT_GUARD_NOW ?? Date.now());

  const result = rules.evaluateCommand({
    command,
    branch,
    stagedFiles,
    resolvePr,
    resolvePrBase: (t, r) => resolvePr(t, r)?.base ?? null,
    now,
    openIncidents,
  });
  if (!result.allow) {
    const reason = incomplete
      ?`A lista de arquivos do PR está incompleta (${incomplete.listed} de ${incomplete.total}): ` +
        'o merge fica bloqueado até `gh pr diff --name-only` trazer todos os arquivos.'
      : result.reason;
    process.stderr.write('[git-guard] ' + reason);
    process.exit(2);
  }
  if (result.reminder) {
    process.stdout.write(
      JSON.stringify({
        systemMessage: result.reminder,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: result.reminder },
      }),
    );
  }
  process.exit(0);
} catch (err) {
  if (MERGE_RE.test(command)) {
    process.stderr.write(
      `[git-guard] não foi possível avaliar o merge (${err?.message ?? err}); merge bloqueado. ` +
        'Confira o estado do PR e tente de novo.',
    );
    process.exit(2);
  }
  process.stderr.write(
    `[git-guard] aviso: não foi possível avaliar (${err?.message ?? err}); comando permitido`,
  );
  process.exit(0);
}
