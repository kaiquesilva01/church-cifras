import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { evaluateCommand } from './git-guard-rules.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = input?.tool_input?.command ?? '';
  if (typeof command !== 'string' || !/\b(git|gh)\b/.test(command)) process.exit(0);

  const cwd = input.cwd || process.cwd();
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  // -z + quotePath=false: nomes com acentos/espaços chegam crus, separados por NUL.
  const stagedFiles = git(['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only', '-z'])
    .split('\0')
    .filter(Boolean);

  const result = evaluateCommand({ command, branch, stagedFiles });
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
  process.stderr.write(
    `[git-guard] aviso: não foi possível avaliar (${err?.message ?? err}); comando permitido`,
  );
  process.exit(0);
}
