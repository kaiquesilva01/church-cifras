import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// `gh pr merge` em qualquer forma (inclusive `gh -R o/r pr merge`): falha da avaliação bloqueia.
const MERGE_RE = /\bgh\b[\s\S]*\bpr\s+merge\b/;

// `firebase deploy` (ou `firebase-tools`, ou alvo `x:deploy`): se o git falhar, a avaliação não pode liberar.
const DEPLOY_RE = /\bfirebase(?:-tools)?\b[\s\S]*(?:\bdeploy\b|:deploy)/;

const RULES_PATH = '.claude/hooks/git-guard-rules.mjs';
const INCIDENT_LIMIT = 100; // `gh issue list` corta em `--limit`; no limite cheio a lista pode estar incompleta.

// Caminho com aspas C do git (ex.: "a/\303\247.mjs" para não-ASCII): decodifica octal e escapes para UTF-8.
const ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
function unquote(p) {
  if (p.length < 2 || !p.startsWith('"') || !p.endsWith('"')) return p;
  const body = p.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      bytes.push(...Buffer.from(body[i], 'utf8'));
    } else if (/^[0-7]{3}$/.test(body.slice(i + 1, i + 4))) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      i++;
      bytes.push(ESCAPES[body[i]] ?? body.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

const strip = (s, prefix) => (s.startsWith(prefix) ? s.slice(prefix.length) : s);

// Cabeçalho `--- a/x` ou `+++ b/x`: null para /dev/null; sem tab final (git põe um quando há espaço no nome).
function headerPath(value, prefix) {
  const v = value.replace(/\t$/, '');
  if (v === '/dev/null') return null;
  return strip(unquote(v), prefix);
}

// `diff --git a/P b/P` (ou com aspas): usado quando a seção não tem `---`/`+++` (renomeação 100%, só modo, binário).
function parseDiffGitHeader(rest) {
  const quoted = /^("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*")$/.exec(rest);
  if (quoted) return { old: strip(unquote(quoted[1]), 'a/'), new: strip(unquote(quoted[2]), 'b/') };
  const len = (rest.length - 5) / 2; // "a/P b/P": P aparece duas vezes
  if (Number.isInteger(len) && rest.startsWith('a/') && rest.slice(2 + len, 5 + len) === ' b/' && rest.slice(5 + len) === rest.slice(2, 2 + len)) {
    const p = rest.slice(2, 2 + len);
    return { old: p, new: p };
  }
  const i = rest.lastIndexOf(' b/');
  return i === -1 ? { old: null, new: null } : { old: strip(rest.slice(0, i), 'a/'), new: rest.slice(i + 3) };
}

// Arquivos de um diff unificado completo (`gh pr diff`). Cada seção `diff --git` é um arquivo; a contagem usa
// o caminho novo (ou o antigo, em deleção), então renomeação conta uma vez. Só as linhas antes do primeiro `@@`
// são cabeçalho: uma linha de conteúdo `--- a/x` não pode criar arquivo.
function filesFromDiff(text) {
  const sections = [];
  let cur = null;
  let inHeader = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('diff --git ')) {
      cur = { old: null, new: null, header: parseDiffGitHeader(line.slice('diff --git '.length)) };
      sections.push(cur);
      inHeader = true;
    } else if (!cur || !inHeader) {
      continue;
    } else if (line.startsWith('@@')) {
      inHeader = false;
    } else if (line.startsWith('rename from ')) {
      cur.old = unquote(line.slice('rename from '.length));
    } else if (line.startsWith('rename to ')) {
      cur.new = unquote(line.slice('rename to '.length));
    } else if (line.startsWith('--- ')) {
      cur.old ??= headerPath(line.slice(4), 'a/');
    } else if (line.startsWith('+++ ')) {
      cur.new ??= headerPath(line.slice(4), 'b/');
    }
  }
  const files = new Set();
  const keys = new Set();
  for (const s of sections) {
    const old = s.old ?? s.header.old;
    const nw = s.new ?? s.header.new;
    if (old) files.add(old);
    if (nw) files.add(nw);
    keys.add(nw ?? old);
  }
  return { files: [...files], count: keys.size };
}
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

  // maxBuffer alto: um diff de PR grande passa do padrão de 1 MB do execFileSync.
  const ghOpts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GH_TIMEOUT, maxBuffer: 64 * 1024 * 1024 };

  // Preenchido quando o diff traz menos arquivos que o PR: a mensagem de bloqueio fica específica.
  let incomplete = null;

  // Chamado só em `gh pr merge`; qualquer falha ou dado incompleto -> null (o guard bloqueia).
  const resolvePr = (target, repo) => {
    try {
      const repoArgs = repo ? ['-R', repo] : [];
      const pr = JSON.parse(execFileSync('gh', ['pr', 'view', target, ...repoArgs, '--json', PR_FIELDS], ghOpts));
      // Um só diff completo: renomeação conta uma vez e traz o caminho antigo (que pode ser guardado).
      const { files, count } = filesFromDiff(execFileSync('gh', ['pr', 'diff', target, ...repoArgs], ghOpts));
      if (count !== pr.changedFiles) {
        incomplete = { listed: count, total: pr.changedFiles };
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
        execFileSync(
          'gh',
          ['issue', 'list', '--label', 'incidente', '--state', 'open', '--json', 'number', '--limit', String(INCIDENT_LIMIT)],
          ghOpts,
        ),
      );
      if (!Array.isArray(issues) || !issues.every((i) => Number.isInteger(i?.number))) return null;
      // No limite cheio a lista pode estar cortada: fail closed.
      return issues.length >= INCIDENT_LIMIT ? null : issues.map((i) => i.number);
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
        'o merge fica bloqueado até `gh pr diff` trazer todos os arquivos.'
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
  if (DEPLOY_RE.test(command)) {
    process.stderr.write(
      `[git-guard] não foi possível avaliar o deploy (${err?.message ?? err}); deploy bloqueado. ` +
        'Rode o deploy só pelo merge do release, dentro de um repositório git.',
    );
    process.exit(2);
  }
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
