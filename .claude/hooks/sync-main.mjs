import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// run(cmd, args) -> { status, stdout, stderr }, injetado (nunca lança).
// Retorna { action: 'none' } | { action: 'updated', from, to } | { action: 'warn', message }.
export function syncMain({ run }) {
  // Worktrees em outras branches (develop, feat/...) são deixadas em paz.
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.status !== 0 || branch.stdout.trim() !== 'main') return { action: 'none' };

  const status = run('git', ['status', '--porcelain', '--untracked-files=no']);
  if (status.status !== 0) return { action: 'none' };
  if (status.stdout.trim() !== '') {
    return {
      action: 'warn',
      message: 'Checkout na main com alterações locais: não atualizei com origin/main.',
    };
  }

  // Sem rede: nada a fazer.
  const fetched = run('git', ['fetch', '--quiet', 'origin', 'main']);
  if (fetched.status !== 0) return { action: 'none' };

  const head = run('git', ['rev-parse', 'HEAD']);
  const remote = run('git', ['rev-parse', 'origin/main']);
  if (head.status !== 0 || remote.status !== 0) return { action: 'none' };
  const headSha = head.stdout.trim();
  const remoteSha = remote.stdout.trim();
  if (headSha === remoteSha) return { action: 'none' };

  // Exit 1: a main local tem commits que origin/main não tem (divergiu).
  const ancestor = run('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
  if (ancestor.status === 1) {
    return { action: 'warn', message: 'A main local divergiu de origin/main: não atualizei.' };
  }
  if (ancestor.status !== 0) return { action: 'none' };

  const merged = run('git', ['merge', '--ff-only', '--quiet', 'origin/main']);
  if (merged.status === 0) {
    return { action: 'updated', from: headSha.slice(0, 7), to: remoteSha.slice(0, 7) };
  }
  const firstLine =
    merged.stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? 'erro desconhecido';
  return {
    action: 'warn',
    message: `Não consegui atualizar a main (fast-forward): ${firstLine}`,
  };
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
  // Após /compact a sessão continua no mesmo checkout: não repetir o aviso.
  if (input.source === 'compact') return;

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

  const result = syncMain({ run });
  let msg = null;
  if (result.action === 'updated') {
    msg =
      `Checkout main atualizado com origin/main (${result.from} → ${result.to}). ` +
      'O AGENTS.md novo vale a partir da próxima sessão.';
  } else if (result.action === 'warn') {
    msg = `[sync-main] ${result.message}`;
  }
  if (msg) {
    process.stdout.write(
      JSON.stringify({
        systemMessage: msg,
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg },
      }),
    );
  }
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
    process.stderr.write(`[sync-main] aviso: ${err?.message ?? err}`);
  }
  // Sem process.exit: deixa o stdout drenar. Um hook de sessão nunca bloqueia (exit 0).
  process.exitCode = 0;
}
