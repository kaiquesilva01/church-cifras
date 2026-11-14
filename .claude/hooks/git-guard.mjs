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
  const stagedFiles = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);

  const result = evaluateCommand({ command, branch, stagedFiles });
  if (!result.allow) {
    process.stderr.write('[git-guard] ' + result.reason);
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(
    `[git-guard] aviso: não foi possível avaliar (${err?.message ?? err}); comando permitido`,
  );
  process.exit(0);
}
