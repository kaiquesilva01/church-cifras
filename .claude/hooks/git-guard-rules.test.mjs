import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommand } from './git-guard-rules.mjs';

const cases = [
  ['blocks commit on main', 'git commit -m "x"', 'main', [], false, 'origin/develop'],
  ['blocks commit on develop', 'git commit -am "x"', 'develop', [], false, 'origin/develop'],
  ['allows commit on feature branch', 'git commit -m "x"', 'feat/a', [], true],
  ['allows commit after checkout -b in same command', 'git checkout -b feat/x origin/develop && git commit -m "x"', 'develop', [], true],
  ['allows commit after switch -c in same command', 'git switch -c fix/y && git commit -m y', 'main', [], true],
  ['blocks commit with staged pdf', 'git commit -m x', 'feat/a', ['fixtures/a.pdf'], false, 'PDF'],
  ['blocks pdf case-insensitively', 'git commit -m x', 'feat/a', ['A.PDF'], false, 'PDF'],
  ['blocks push to main refspec', 'git push origin main', 'feat/a', [], false, 'develop'],
  ['blocks push HEAD:develop', 'git push origin HEAD:develop', 'feat/a', [], false, 'develop'],
  ['blocks push refs/heads/main', 'git push origin feat/a:refs/heads/main', 'feat/a', [], false, 'develop'],
  ['blocks bare push on protected branch', 'git push', 'develop', [], false, 'develop'],
  ['blocks push HEAD on protected branch', 'git push -u origin HEAD', 'develop', [], false, 'develop'],
  ['allows push of feature branch', 'git push -u origin feat/a', 'feat/a', [], true],
  ['blocks force push to protected', 'git push --force origin develop', 'feat/a', [], false, 'develop'],
  ['blocks pr create without explicit base', 'gh pr create --title t --body b', 'feat/a', [], false, '--base develop'],
  ['allows pr create to develop', 'gh pr create --base develop --title t', 'feat/a', [], true],
  ['allows pr create with -B develop', 'gh pr create -B develop -t t', 'feat/a', [], true],
  ['blocks pr to main from feature', 'gh pr create --base main', 'feat/a', [], false, 'develop'],
  ['blocks pr to main with --head feature', 'gh pr create --base=main --head feat/a', 'develop', [], false, 'develop'],
  ['allows pr develop to main', 'gh pr create --base main --head develop', 'feat/a', [], true],
  ['allows pr to main when on develop', 'gh pr create --base main', 'develop', [], true],
  ['blocks gh pr merge', 'gh pr merge 12 --squash', 'feat/a', [], false, 'humana'],
  ['handles powershell separators and quotes', "git add .; git commit -m 'msg; with semicolon'", 'main', [], false, 'origin/develop'],
  ['ignores git words inside quoted text', 'echo "git commit on main" && ls', 'main', [], true],
  ['blocks commit with git -C on main', 'git -C . commit -m x', 'main', [], false, 'origin/develop'],
  ['blocks push with -c option to develop', 'git -c core.x=y push origin develop', 'feat/a', [], false, 'develop'],
  ['blocks commit with env prefix', 'GIT_AUTHOR_NAME=x git commit -m y', 'develop', [], false, 'origin/develop'],
  ['allows unrelated commands', 'npm test', 'main', [], true],
];

for (const [name, command, branch, stagedFiles, allow, snippet] of cases) {
  test(name, () => {
    const result = evaluateCommand({ command, branch, stagedFiles });
    assert.deepEqual(result.allow, allow);
    if (!allow) assert.ok(result.reason.includes(snippet), `reason sem "${snippet}": ${result.reason}`);
  });
}
