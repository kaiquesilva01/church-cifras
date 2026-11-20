import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { evaluateCommand } from './git-guard-rules.mjs';

// `gh pr merge` em qualquer forma (inclusive `gh -R o/r pr merge`): falha da avaliação bloqueia.
const MERGE_RE = /\bgh\b[\s\S]*\bpr\s+merge\b/;

let command = '';
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const raw = input?.tool_input?.command ?? '';
  if (typeof raw !== 'string' || !/\b(git|gh)\b/.test(raw)) process.exit(0);
  command = raw;

  const cwd = input.cwd || process.cwd();
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  // -z + quotePath=false: nomes com acentos/espaços chegam crus, separados por NUL.
  const stagedFiles = git(['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only', '-z'])
    .split('\0')
    .filter(Boolean);

  // Chamado só quando há `gh pr merge`; qualquer falha ou JSON incompleto -> null (o guard bloqueia).
  const PR_FIELDS = 'baseRefName,headRefName,headRefOid,statusCheckRollup,labels,files,changedFiles,body';
  const resolvePr = (target, repo) => {
    try {
      const args = ['pr', 'view', target, ...(repo ? ['-R', repo] : []), '--json', PR_FIELDS];
      const pr = JSON.parse(
        execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }),
      );
      // gh pode truncar `files` em PRs grandes: lista incompleta ou ausente não pode liberar as travas.
      if (!Array.isArray(pr.files) || pr.files.length !== pr.changedFiles) return null;
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
        files: pr.files.map((f) => f.path),
        body: pr.body ?? '',
      };
    } catch {
      return null;
    }
  };

  const result = evaluateCommand({ command, branch, stagedFiles, resolvePr });
  if (!result.allow) {
    process.stderr.write('[git-guard] ' + result.reason);
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
