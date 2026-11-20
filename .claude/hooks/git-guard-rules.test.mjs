import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCommand,
  touches,
  ciGreen,
  closingRefs,
  isFreezeWindow,
  GUARD_PATHS,
  DEVICE_TEST_PATHS,
} from './git-guard-rules.mjs';

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

test('never approves a PR, on any base', () => {
  for (const command of [
    'gh pr review 5 --approve',
    'gh pr review --approve 5 -b "ok"',
    'gh pr review 5 -a',
    'gh -R o/r pr review 5 --approve',
    'git checkout develop && gh pr review 5 -a -b lgtm',
  ]) {
    const r = evaluateCommand({ command, branch: 'feat/a', stagedFiles: [] });
    assert.equal(r.allow, false, command);
    assert.match(r.reason ?? r.message ?? '', /Aprovar PR/, command);
  }
});

test('still allows commenting or requesting changes on a PR', () => {
  for (const command of ['gh pr review 5 --comment -b "nit"', 'gh pr review 5 -r -b "fix"', 'gh pr view 5']) {
    const r = evaluateCommand({ command, branch: 'feat/a', stagedFiles: [] });
    assert.equal(r.allow, true, command);
  }
});

test('allows opening the release PR develop -> main (the human approves and merges it)', () => {
  const r = evaluateCommand({
    command: 'gh pr create --base main --head develop --title "release" --body "x"',
    branch: 'feat/a',
    stagedFiles: [],
  });
  assert.equal(r.allow, true);
});

const FACTS = {
  base: 'develop',
  head: 'feat/95-x',
  headSha: 'abc',
  checks: [{ name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  labels: ['revisado', 'qa-ok'],
  files: ['apps/web/src/stats/StatsPage.tsx'],
  body: '',
};

const mergeWith = (command, resolvePr, extra = {}) =>
  evaluateCommand({ command, branch: 'feat/a', stagedFiles: [], resolvePr, ...extra });

const merge = (command, facts = FACTS, extra = {}) => mergeWith(command, () => facts, extra);

// Release develop -> main: facts da release, relógio numa quarta (fora da janela) e sem incidentes.
const RELEASE = { ...FACTS, base: 'main', head: 'develop', headSha: 'abc123', labels: [] };
const WEDNESDAY = () => new Date('2026-11-25T15:00:00Z');
const release = (command, facts = RELEASE, extra = {}) =>
  merge(command, facts, { now: WEDNESDAY, openIncidents: () => [], ...extra });

test('allows develop merge with green CI and both labels', () => {
  let received;
  const r = mergeWith('gh pr merge 2 --squash --delete-branch', (t) => ((received = t), FACTS));
  assert.equal(r.allow, true, r.reason);
  assert.equal(received, '2');
});

test('blocks develop merge when CI is not green', () => {
  const notGreen = [
    [{ name: 'checks', status: 'IN_PROGRESS' }],
    [],
    [{ name: 'checks', status: 'COMPLETED', conclusion: 'CANCELLED' }],
    [{ name: 'checks', status: 'COMPLETED', conclusion: 'FAILURE' }],
    [{ __typename: 'StatusContext', state: 'PENDING' }],
  ];
  for (const checks of notGreen) {
    const r = merge('gh pr merge 2 --squash', { ...FACTS, checks });
    assert.equal(r.allow, false, JSON.stringify(checks));
    assert.ok(r.reason.includes('CI'), r.reason);
  }
});

test('blocks develop merge without revisado or qa-ok', () => {
  const noQa = merge('gh pr merge 2', { ...FACTS, labels: ['revisado'] });
  assert.equal(noQa.allow, false);
  assert.match(noQa.reason, /Faltam as etiquetas[^:]*qa-ok/, noQa.reason);

  const noRev = merge('gh pr merge 2', { ...FACTS, labels: ['qa-ok'] });
  assert.equal(noRev.allow, false);
  assert.match(noRev.reason, /Faltam as etiquetas[^:]*revisado/, noRev.reason);
});

test('requires teste-celular-ok when the PR touches viewer, setlists or pad', () => {
  const pad = { ...FACTS, files: ['apps/web/src/pad/PadPage.tsx'] };
  const blocked = merge('gh pr merge 2', pad);
  assert.equal(blocked.allow, false);
  assert.ok(blocked.reason.includes('teste-celular-ok'), blocked.reason);

  const withLabel = { ...pad, labels: ['revisado', 'qa-ok', 'teste-celular-ok'] };
  assert.equal(merge('gh pr merge 2', withLabel).allow, true);

  for (const f of ['apps/web/src/viewer/V.tsx', 'apps/web/src/setlists/S.tsx']) {
    assert.equal(merge('gh pr merge 2', { ...FACTS, files: [f] }).allow, false, f);
    assert.equal(merge('gh pr merge 2', { ...FACTS, files: [f], labels: ['revisado', 'qa-ok', 'teste-celular-ok'] }).allow, true, f);
  }

  assert.equal(merge('gh pr merge 2', { ...FACTS, files: ['apps/web/src/viewer-old/x.ts'] }).allow, true);
});

test('blocks develop merge of PRs that change the guards', () => {
  for (const f of ['.claude/hooks/x.mjs', '.github/workflows/ci.yml', 'firebase.json', 'cors.json', 'AGENTS.md', 'CLAUDE.md']) {
    const r = merge('gh pr merge 2', { ...FACTS, files: [f] });
    assert.equal(r.allow, false, f);
    assert.ok(r.reason.includes('merge é da pessoa'), r.reason);
  }
  assert.equal(merge('gh pr merge 2', { ...FACTS, files: ['docs/AGENTS.md'] }).allow, true);
});

test('blocks guard paths regardless of case (Windows checkouts)', () => {
  for (const f of ['.Claude/hooks/x.mjs', 'claude.md', 'Firebase.json']) {
    const r = merge('gh pr merge 2', { ...FACTS, files: [f] });
    assert.equal(r.allow, false, f);
    assert.ok(r.reason.includes('merge é da pessoa'), r.reason);
  }
});

test('device-test paths regardless of case need teste-celular-ok', () => {
  const r = merge('gh pr merge 2', { ...FACTS, files: ['apps/web/src/Pad/x.tsx'] });
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('teste-celular-ok'), r.reason);
});

test('guards are checked before CI', () => {
  const r = merge('gh pr merge 2', { ...FACTS, files: ['AGENTS.md'], checks: [] });
  assert.ok(r.reason.includes('merge é da pessoa'), r.reason);
});

test('blocks develop merge when facts are unavailable', () => {
  const r = merge('gh pr merge 2', null);
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('gh pr view'), r.reason);
});

test('blocks merge into a base other than develop or main', () => {
  const r = merge('gh pr merge 2', { ...FACTS, base: 'feat/x' });
  assert.equal(r.allow, false);
});

test('touches matches folder prefixes and exact files', () => {
  assert.deepEqual(touches(['.claude/hooks/x.mjs'], GUARD_PATHS), ['.claude/hooks/x.mjs']);
  assert.deepEqual(touches(['firebase.json'], GUARD_PATHS), ['firebase.json']);
  assert.deepEqual(touches(['docs/AGENTS.md'], GUARD_PATHS), []);
  assert.deepEqual(touches(['firebase.json.bak'], GUARD_PATHS), []);
  assert.deepEqual(touches(['apps/web/src/pad/PadPage.tsx'], DEVICE_TEST_PATHS), ['apps/web/src/pad/PadPage.tsx']);
  assert.deepEqual(touches(['apps/web/src/viewer-old/x.ts'], DEVICE_TEST_PATHS), []);
});

test('ciGreen needs at least one check and all of them green', () => {
  assert.equal(ciGreen([]), false);
  assert.equal(
    ciGreen([
      { name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'b', status: 'COMPLETED', conclusion: 'SKIPPED' },
      { name: 'c', status: 'COMPLETED', conclusion: 'NEUTRAL' },
    ]),
    true,
  );
  assert.equal(ciGreen([{ name: 'a', status: 'IN_PROGRESS' }]), false);
  assert.equal(ciGreen([{ name: 'a', status: 'COMPLETED', conclusion: 'CANCELLED' }]), false);
  assert.equal(ciGreen([{ name: 'a', status: 'COMPLETED', conclusion: 'FAILURE' }]), false);
  assert.equal(ciGreen([{ __typename: 'StatusContext', state: 'SUCCESS' }]), true);
  assert.equal(ciGreen([{ __typename: 'StatusContext', state: 'PENDING' }]), false);
  assert.equal(
    ciGreen([
      { name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'b', status: 'COMPLETED', conclusion: 'FAILURE' },
    ]),
    false,
  );
});

const target = (command) => {
  let got = 'unset';
  const r = mergeWith(command, (t, repo) => ((got = [t, repo]), FACTS));
  return { r, got };
};

test('merge with main base needs --merge (release develop -> main)', () => {
  const r = release('gh pr merge 2 --squash');
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('--merge'), r.reason);
});

test('blocks merge with -R when base main and no --merge', () => {
  const r = release('gh -R o/r pr merge 3');
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('--merge'), r.reason);
});

test('allows the release merge with --merge and the current head', () => {
  const r = release('gh pr merge 99 --merge --match-head-commit abc123');
  assert.equal(r.allow, true, r.reason);
});

test('the release merge goes through the same guards in any command form', () => {
  const forms = [
    'if ($?) { gh pr merge https://github.com/o/r/pull/99 --merge --match-head-commit abc123 }',
    'gh -R o/r pr merge 99 -m --match-head-commit abc123',
  ];
  for (const c of forms) {
    assert.equal(release(c).allow, true, c);
    const inWindow = release(c, RELEASE, { now: () => new Date('2026-11-26T19:30:00Z') });
    assert.equal(inWindow.allow, false, c);
    assert.match(inWindow.reason, /janela do culto/i, c);
  }
});

test('blocks release merge without --merge or with squash, rebase, auto or admin', () => {
  for (const c of [
    'gh pr merge 99 --match-head-commit abc123',
    'gh pr merge 99 --squash --match-head-commit abc123',
    'gh pr merge 99 -s --match-head-commit abc123',
    'gh pr merge 99 --merge --rebase --match-head-commit abc123',
    'gh pr merge 99 -m -r --match-head-commit abc123',
    'gh pr merge 99 --merge --auto --match-head-commit abc123',
    'gh pr merge 99 --merge --admin --match-head-commit abc123',
  ]) {
    const r = release(c);
    assert.equal(r.allow, false, c);
    assert.ok(r.reason.includes('--merge'), `${c}: ${r.reason}`);
  }
});

test('blocks release merge without --match-head-commit or with another sha', () => {
  for (const c of ['gh pr merge 99 --merge', 'gh pr merge 99 --merge --match-head-commit zzz']) {
    const r = release(c);
    assert.equal(r.allow, false, c);
    assert.ok(r.reason.includes('--match-head-commit'), r.reason);
  }
});

test('blocks release from a head other than develop', () => {
  const r = release('gh pr merge 99 --merge --match-head-commit abc123', { ...RELEASE, head: 'feat/x' });
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('develop'), r.reason);
});

test('blocks release merge when CI is not green', () => {
  const notGreen = [
    [{ name: 'checks', status: 'IN_PROGRESS' }],
    [],
    [{ name: 'checks', status: 'COMPLETED', conclusion: 'FAILURE' }],
    [{ __typename: 'StatusContext', state: 'PENDING' }],
  ];
  for (const checks of notGreen) {
    const r = release('gh pr merge 99 --merge --match-head-commit abc123', { ...RELEASE, checks });
    assert.equal(r.allow, false, JSON.stringify(checks));
    assert.ok(r.reason.includes('CI'), r.reason);
  }
});

test('blocks release merge in the worship window (Thu and Sun from 16h30 Brasília)', () => {
  const cases = [
    ['2026-11-26T19:29:00Z', true], // qui 16h29
    ['2026-11-26T19:30:00Z', false], // qui 16h30
    ['2026-11-30T02:59:00Z', false], // dom 23h59
    ['2026-11-30T03:00:00Z', true], // seg 00h00
    ['2026-11-25T23:00:00Z', true], // qua 20h00
    ['2026-11-27T02:00:00Z', false], // qui 23h00 em Brasília (sexta em UTC)
  ];
  for (const [iso, allow] of cases) {
    const r = release('gh pr merge 99 --merge --match-head-commit abc123', RELEASE, { now: () => new Date(iso) });
    assert.equal(r.allow, allow, iso);
    if (!allow) assert.match(r.reason, /janela do culto/i, iso);
  }
});

test('isFreezeWindow uses Brasília time', () => {
  assert.equal(isFreezeWindow(new Date('2026-11-26T19:30:00Z')), true);
  assert.equal(isFreezeWindow(new Date('2026-11-26T19:29:00Z')), false);
  assert.equal(isFreezeWindow(new Date('2026-11-25T19:30:00Z')), false);
});

test('blocks release while an incident is open unless the PR closes it', () => {
  const cmd = 'gh pr merge 99 --merge --match-head-commit abc123';
  const open = release(cmd, RELEASE, { openIncidents: () => [120] });
  assert.equal(open.allow, false);
  assert.ok(open.reason.includes('incidente'), open.reason);

  const closed = release(cmd, { ...RELEASE, body: 'Closes #120' }, { openIncidents: () => [120] });
  assert.equal(closed.allow, true, closed.reason);

  const unknown = release(cmd, RELEASE, { openIncidents: () => null });
  assert.equal(unknown.allow, false);
  assert.ok(unknown.reason.includes('incidente'), unknown.reason);
});

test('blocks --auto on any base', () => {
  for (const [c, facts] of [
    ['gh pr merge 2 --squash --auto', FACTS],
    ['gh pr merge 99 --merge --auto --match-head-commit abc123', RELEASE],
  ]) {
    const r = merge(c, facts, { now: WEDNESDAY, openIncidents: () => [] });
    assert.equal(r.allow, false, c);
    assert.ok(r.reason.includes('--auto'), r.reason);
  }
});

test('blocks --auto, --admin, --squash and --rebase written as --flag=true on release', () => {
  for (const flag of ['--auto=true', '--admin=true', '--squash=true', '--rebase=true']) {
    const r = release(`gh pr merge 99 --merge ${flag} --match-head-commit abc123`);
    assert.equal(r.allow, false, flag);
    assert.ok(r.reason.includes('--merge'), `${flag}: ${r.reason}`);
  }
});

test('blocks --auto=true on develop too', () => {
  const r = merge('gh pr merge 2 --squash --auto=true', FACTS, { now: WEDNESDAY, openIncidents: () => [] });
  assert.equal(r.allow, false);
  assert.ok(r.reason.includes('--auto'), r.reason);
});

test('allows --match-head-commit=<sha> on release', () => {
  assert.equal(release('gh pr merge 99 --merge --match-head-commit=abc123').allow, true);
  assert.equal(release('gh pr merge 99 --merge --match-head-commit=zzz').allow, false);
});

test('--flag=false counts as absent and --merge=true as --merge', () => {
  const noMerge = release('gh pr merge 99 --merge=false --match-head-commit abc123');
  assert.equal(noMerge.allow, false);
  assert.ok(noMerge.reason.includes('--merge'), noMerge.reason);
  assert.equal(release('gh pr merge 99 --merge=true --match-head-commit abc123').allow, true);
  assert.equal(release('gh pr merge 99 --merge --squash=false --match-head-commit abc123').allow, true);
  assert.equal(release('gh pr merge 99 --merge --auto=false --match-head-commit abc123').allow, true);
});

test('blocks --delete-branch on the release (it would delete develop)', () => {
  for (const flag of ['--delete-branch', '-d', '--delete-branch=true', '-d=true', '-md']) {
    const r = release(`gh pr merge 99 ${flag} --match-head-commit abc123`);
    assert.equal(r.allow, false, flag);
    assert.ok(r.reason.includes('--merge'), `${flag}: ${r.reason}`);
  }
  assert.equal(release('gh pr merge 99 --merge --delete-branch=false --match-head-commit abc123').allow, true);
});

test('--delete-branch stays allowed on develop merges', () => {
  for (const c of ['gh pr merge 2 --squash --delete-branch', 'gh pr merge 2 --squash -d', 'gh pr merge 2 --squash --delete-branch=true']) {
    assert.equal(merge(c).allow, true, c);
  }
});

test('closingRefs reads closing keywords, case-insensitive, without repeats', () => {
  assert.deepEqual(closingRefs('Closes #95\nresolves #96, Parte de #85'), [95, 96]);
  assert.deepEqual(closingRefs('CLOSES #1, closes #1 and Fixed #2'), [1, 2]);
  assert.deepEqual(closingRefs(''), []);
});

test('blocks merge without explicit target', () => {
  for (const c of ['gh pr merge --squash', 'git checkout develop; gh pr merge --squash', 'git switch develop && gh pr merge --merge', 'cd ../wt && gh pr merge --squash']) {
    let called = false;
    const r = mergeWith(c, () => ((called = true), FACTS));
    assert.equal(r.allow, false, c);
    assert.ok(r.reason.includes('informe o número do PR'), r.reason);
    assert.equal(called, false);
  }
});

test('skips flag values when finding the merge target', () => {
  let received;
  mergeWith('gh pr merge --subject "x y" -b body --match-head-commit abc -R o/r 7 --auto', (t) => ((received = t), FACTS));
  assert.equal(received, '7');
});

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
  const r = merge('gh pr merge 1 && gh pr merge 2');
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
    const r = merge(c);
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
    assert.equal(merge(c, null).allow, true, c);
  }
});

test('star redirect is not the target', () => {
  assert.equal(target('gh pr merge 3 --squash *>&1').got[0], '3');
});

test('glued -R repo', () => {
  assert.deepEqual(target('gh pr merge 7 -Ro/r').got, ['7', 'o/r']);
  assert.deepEqual(target('gh -Ro/r pr merge 7').got, ['7', 'o/r']);
});
