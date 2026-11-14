import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommand } from './git-guard-rules.mjs';

const cases = [
  ['blocks commit on main', 'git commit -m "x"', 'main', [], false, 'Commit direto'],
  ['blocks commit on develop', 'git commit -am "x"', 'develop', [], false, 'Commit direto'],
  ['allows commit on feature branch', 'git commit -m "x"', 'feat/a', [], true],
  ['allows commit after checkout -b in same command', 'git checkout -b feat/x origin/develop && git commit -m "x"', 'develop', [], true],
  ['allows commit after switch -c in same command', 'git switch -c fix/y && git commit -m y', 'main', [], true],
  ['blocks commit with staged pdf', 'git commit -m x', 'feat/a', ['fixtures/a.pdf'], false, 'PDF'],
  ['blocks pdf case-insensitively', 'git commit -m x', 'feat/a', ['A.PDF'], false, 'PDF'],
  ['blocks push to main refspec', 'git push origin main', 'feat/a', [], false, 'Push para'],
  ['blocks push HEAD:develop', 'git push origin HEAD:develop', 'feat/a', [], false, 'Push para'],
  ['blocks push refs/heads/main', 'git push origin feat/a:refs/heads/main', 'feat/a', [], false, 'Push para'],
  ['blocks bare push on protected branch', 'git push', 'develop', [], false, 'Push para'],
  ['blocks push HEAD on protected branch', 'git push -u origin HEAD', 'develop', [], false, 'Push para'],
  ['allows push of feature branch', 'git push -u origin feat/a', 'feat/a', [], true],
  ['blocks force push to protected', 'git push --force origin develop', 'feat/a', [], false, 'Push para'],
  ['blocks pr create without explicit base', 'gh pr create --title t --body b', 'feat/a', [], false, '--base develop'],
  ['allows pr create to develop', 'gh pr create --base develop --title t', 'feat/a', [], true],
  ['allows pr create with -B develop', 'gh pr create -B develop -t t', 'feat/a', [], true],
  ['blocks pr to main from feature', 'gh pr create --base main', 'feat/a', [], false, 'develop'],
  ['blocks pr to main with --head feature', 'gh pr create --base=main --head feat/a', 'develop', [], false, 'develop'],
  ['allows pr develop to main', 'gh pr create --base main --head develop', 'feat/a', [], true],
  ['allows pr to main when on develop', 'gh pr create --base main', 'develop', [], true],
  ['blocks gh pr merge when base unresolved by default', 'gh pr merge 12 --squash', 'feat/a', [], false, 'base do PR'],
  ['handles powershell separators and quotes', "git add .; git commit -m 'msg; with semicolon'", 'main', [], false, 'Commit direto'],
  ['ignores git words inside quoted text', 'echo "git commit on main" && ls', 'main', [], true],
  ['blocks commit with git -C on main', 'git -C . commit -m x', 'main', [], false, 'Commit direto'],
  ['blocks push with -c option to develop', 'git -c core.x=y push origin develop', 'feat/a', [], false, 'Push para'],
  ['blocks commit with env prefix', 'GIT_AUTHOR_NAME=x git commit -m y', 'develop', [], false, 'Commit direto'],
  ['blocks commit after checkout of a path', 'git checkout README.md && git commit -m x', 'main', [], false, 'checkout'],
  ['blocks commit after checkout dot', 'git checkout . && git commit -m x', 'main', [], false, 'checkout'],
  ['blocks commit after checkout -q main', 'git checkout -q main && git commit -m x', 'feat/a', [], false, 'Commit direto'],
  ['allows commit after switch to feature', 'git switch feat/b && git commit -m x', 'main', [], true],
  ['blocks git add of pdf', 'git add -f docs/a.PDF', 'feat/a', [], false, 'PDF'],
  ['blocks add pdf then commit', 'git add a.pdf && git commit -m x', 'feat/a', [], false, 'PDF'],
  ['blocks commit with pdf pathspec', 'git commit -m x a.pdf', 'feat/a', [], false, 'PDF'],
  ['allows commit message mentioning pdf', 'git commit -m "remove a.pdf"', 'feat/a', [], true],
  ['blocks gh pr merge with -R when base unresolved by default', 'gh -R o/r pr merge 1', 'feat/a', [], false, 'base do PR'],
  ['blocks pr to main with --repo', 'gh --repo o/r pr create --base main', 'feat/a', [], false, 'develop'],
  ['blocks commit in subshell parens', '(git commit -m x)', 'main', [], false, 'Commit direto'],
  ['blocks commit after if then', 'if true; then git commit -m x; fi', 'main', [], false, 'Commit direto'],
  ['blocks git.exe commit', 'git.exe commit -m x', 'main', [], false, 'Commit direto'],
  ['blocks absolute path git', '/usr/bin/git push origin main', 'feat/a', [], false, 'Push para'],
  ['blocks bash -c commit', 'bash -c "git commit -m x"', 'develop', [], false, 'Commit direto'],
  ['allows unrelated commands', 'npm test', 'main', [], true],
  // PowerShell 5.1 / subshells: chaves e parênteses separam segmentos
  ['blocks commit in if ($?) block', 'git add .; if ($?) { git commit -m "x" }', 'develop', [], false, 'Commit direto'],
  ['blocks push after commit in if block', 'git commit -m x; if ($?) { git push origin develop }', 'feat/a', [], false, 'Push para'],
  ['blocks push in LASTEXITCODE block', 'if ($LASTEXITCODE -eq 0) { git push origin main }', 'feat/a', [], false, 'Push para'],
  ['blocks push in try block', 'try { git push origin develop } catch {}', 'feat/a', [], false, 'Push para'],
  ['blocks pr merge in braces when base unresolved', 'if ($?) { gh pr merge 3 }', 'feat/a', [], false, 'base do PR'],
  ['blocks push inside command substitution', 'echo $(git push origin main)', 'feat/a', [], false, 'Push para'],
  // switch --track, push options, --all/--mirror
  ['blocks commit after switch --track', 'git switch --track origin/develop && git commit -m x', 'feat/a', [], false, 'checkout/switch'],
  ['blocks push with -o value on protected branch', 'git push -o ci.skip origin', 'develop', [], false, 'Push para'],
  ['blocks push with --push-option= on protected branch', 'git push --push-option=ci.skip origin', 'develop', [], false, 'Push para'],
  ['blocks push --all', 'git push --all origin', 'feat/a', [], false, 'Push para'],
  ['blocks push --mirror', 'git push --mirror', 'feat/a', [], false, 'Push para'],
  // gh pr edit / head com owner
  ['blocks pr edit base main', 'gh pr edit 5 --base main', 'feat/a', [], false, 'develop'],
  ['allows pr edit base develop', 'gh pr edit 5 --base develop', 'feat/a', [], true],
  ['allows pr to main with owner:develop head', 'gh pr create --base main --head owner:develop', 'feat/a', [], true],
  ['blocks pr to main with owner:feature head', 'gh pr create --base main --head owner:feat/a', 'develop', [], false, 'develop'],
  // here-strings e heredocs são opacos
  ['detects push after powershell here-string', "git commit -m @'\ndon't\n'@; git push origin develop", 'feat/a', [], false, 'Push para'],
  ['detects push after bash heredoc', "cat <<'EOF'\ndon't\nEOF\ngit push origin develop", 'feat/a', [], false, 'Push para'],
  ['allows heredoc commit message mentioning main', "git commit -m \"$(cat <<'EOF'\ndon't push to main\nEOF\n)\"", 'feat/a', [], true],
  ['allows unquoted heredoc body mentioning push', 'cat <<-EOF\n\tgit push origin main\n\tEOF\nls', 'feat/a', [], true],
  // casos permitidos (travados)
  ['allows git diff main', 'git diff main', 'feat/a', [], true],
  ['allows git log origin/main..develop', 'git log origin/main..develop', 'feat/a', [], true],
  ['allows git fetch origin develop', 'git fetch origin develop', 'feat/a', [], true],
  ['allows git pull origin develop', 'git pull origin develop', 'feat/a', [], true],
  ['allows gh pr view', 'gh pr view 3', 'feat/a', [], true],
  ['allows git rebase origin/develop', 'git rebase origin/develop', 'feat/a', [], true],
  ['allows pr create main from develop explicit head', 'gh pr create --base main --head develop', 'feat/a', [], true],
  ['allows commit message mentioning main and develop', 'git commit -m "merge main into develop"', 'feat/a', [], true],
];

for (const [name, command, branch, stagedFiles, allow, snippet] of cases) {
  test(name, () => {
    const result = evaluateCommand({ command, branch, stagedFiles });
    assert.deepEqual(result.allow, allow);
    if (!allow) assert.ok(result.reason.includes(snippet), `reason sem "${snippet}": ${result.reason}`);
  });
}

test('pr create to develop carries a test reminder', () => {
  const r = evaluateCommand({ command: 'gh pr create --base develop --title t', branch: 'feat/a', stagedFiles: [] });
  assert.equal(r.allow, true);
  assert.ok(r.reminder.includes('testes'), r.reminder);
});

test('non pr-create allowed commands carry no reminder', () => {
  const r = evaluateCommand({ command: 'git status', branch: 'feat/a', stagedFiles: [] });
  assert.deepEqual(r, { allow: true });
});

const merge = (command, resolvePrBase) =>
  evaluateCommand({ command, branch: 'feat/a', stagedFiles: [], resolvePrBase });

test('allows merge when base is develop', () => {
  let received;
  const r = merge('gh pr merge 2 --squash --delete-branch', (t) => ((received = t), 'develop'));
  assert.equal(r.allow, true);
  assert.equal(received, '2');
});

test('blocks merge when base is main', () => {
  const r = merge('gh pr merge 2 --squash', () => 'main');
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('humana'), r.reason);
});

test('blocks merge when base unknown', () => {
  const r = merge('gh pr merge 2 --squash', () => null);
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('gh pr view'), r.reason);
});

test('blocks merge with -R when base main', () => {
  const r = merge('gh -R o/r pr merge 3', () => 'main');
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('humana'), r.reason);
});

test('blocks merge without explicit target', () => {
  for (const c of ['gh pr merge --squash', 'git checkout develop; gh pr merge --squash', 'git switch develop && gh pr merge --merge', 'cd ../wt && gh pr merge --squash']) {
    let called = false;
    const r = merge(c, () => ((called = true), 'develop'));
    assert.equal(r.allow, false, c);
    assert.ok(r.reason.includes('informe o número do PR'), r.reason);
    assert.equal(called, false);
  }
});

test('skips flag values when finding the merge target', () => {
  let received;
  merge('gh pr merge --subject "x y" -b body --match-head-commit abc -R o/r 7 --auto', (t) => ((received = t), 'develop'));
  assert.equal(received, '7');
});

const target = (command) => {
  let got = 'unset';
  const r = merge(command, (t, repo) => ((got = [t, repo]), 'develop'));
  return { r, got };
};

test('author-email flag value is not the target', () => {
  assert.deepEqual(target('gh pr merge -A x 7').got, ['7', null]);
  assert.deepEqual(target('gh pr merge --author-email x 7').got, ['7', null]);
});

test('blocks merge with more than one target', () => {
  const { r } = target('gh pr merge 7 5');
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('mais de um alvo'), r.reason);
});

test('passes repo to resolver', () => {
  assert.deepEqual(target('gh -R o/r pr merge 7').got, ['7', 'o/r']);
  assert.deepEqual(target('gh pr merge 7 -R o/r').got, ['7', 'o/r']);
  assert.deepEqual(target('gh pr merge 7 --repo=o/r').got, ['7', 'o/r']);
  assert.deepEqual(target('gh --repo o/r pr merge 7').got, ['7', 'o/r']);
});

test('blocks merge with GH_REPO', () => {
  for (const c of ['GH_REPO=o/r gh pr merge 7', '$env:GH_REPO="o/r"; gh pr merge 7']) {
    const { r } = target(c);
    assert.equal(r.allow, false, c);
    assert.ok(r.reason.includes('-R'), r.reason);
  }
});

test('url, branch and =-form targets', () => {
  assert.equal(target('gh pr merge https://github.com/o/r/pull/9').got[0], 'https://github.com/o/r/pull/9');
  assert.equal(target('gh pr merge feat/x').got[0], 'feat/x');
  assert.equal(target('gh pr merge --subject=foo 7').got[0], '7');
});

test('redirects are not the target', () => {
  assert.equal(target('gh pr merge 3 --squash 2>&1').got[0], '3');
  assert.equal(target('gh pr merge 3 >out.txt').got[0], '3');
  assert.equal(target('gh pr merge 3 > out.txt').got[0], '3');
});

test('blocks more than one merge per command', () => {
  const r = merge('gh pr merge 1 && gh pr merge 2', () => 'develop');
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('um merge por comando'), r.reason);
});

const API_REASON = 'só é permitido para leitura';

test('blocks mutating gh api calls', () => {
  for (const c of [
    'gh api -X PUT repos/o/r/pulls/3/merge',
    'gh api repos/{owner}/{repo}/pulls/5/merge -X PUT',
    'gh api repos/o/r/pulls/3/merge -XPUT',
    'gh api repos/o/r/pulls/3 --method=patch',
    'gh api repos/o/r/pulls/3 --method POST',
    'gh api repos/o/r/pulls/3/merge -f merge_method=squash',
    'gh api repos/o/r/pulls/3 -fbase=main',
    'gh api repos/o/r/pulls/3 -F base=main',
    'gh api repos/o/r/pulls/3 --field base=main',
    'gh api repos/o/r/pulls/3 --raw-field=base=main',
    'gh api repos/o/r/merges -f base=main -f head=develop',
    'gh api repos/o/r/pulls/3 --input b.json',
    `gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }'`,
    'gh api graphql --input q.json',
    'echo ok && gh api repos/o/r/issues/1/comments -f body=x',
    'bash -c "gh api repos/o/r/pulls/3/merge -X PUT"',
    '/usr/bin/gh api repos/o/r/pulls/5/merge -X PUT',
    'C:\\gh\\gh.exe api repos/o/r/pulls/5/merge -X PUT',
    'gh.EXE api repos/o/r/pulls/5/merge -X PUT',
    '"gh" api repos/o/r/pulls/5/merge -X PUT',
    '& "C:\\Program Files\\GitHub CLI\\gh.exe" api repos/o/r/pulls/5/merge -X PUT',
    'gh api repos/o/r/merges -f base=main -f head=develop -t graphql',
    'gh api repos/o/r/merges -f base=main --jq graphql',
    'gh api graphql -F query=@m.graphql',
    'gh api graphql -f query=@m.graphql',
    'gh api -iX PUT repos/o/r/pulls/3/merge',
    'gh api -iXPUT repos/o/r/pulls/3/merge',
    'gh api -if base=main repos/o/r/pulls/3',
  ]) {
    const r = merge(c, () => 'develop');
    assert.equal(r.allow, false, c);
    assert.ok(r.reason.includes(API_REASON), r.reason);
  }
});

test('allows read-only gh api calls', () => {
  for (const c of [
    'gh api repos/o/r/pulls/3',
    'gh api repos/{owner}/{repo}/pulls/3/files',
    'gh api -X GET repos/o/r/pulls',
    'gh api --method=get repos/o/r/pulls',
    `gh api graphql -f query='query { viewer { login } }'`,
    'gh api repos/o/r/pulls/3 --jq .title | cat',
  ]) {
    assert.equal(merge(c, () => null).allow, true, c);
  }
});

test('star redirect is not the target', () => {
  assert.equal(target('gh pr merge 3 --squash *>&1').got[0], '3');
});

test('glued -R repo', () => {
  assert.deepEqual(target('gh pr merge 7 -Ro/r').got, ['7', 'o/r']);
  assert.deepEqual(target('gh -Ro/r pr merge 7').got, ['7', 'o/r']);
});
