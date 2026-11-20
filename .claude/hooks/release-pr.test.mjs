import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_TITLE,
  pendingSubjects,
  prNumbers,
  resolvedIssues,
  buildReleaseBody,
  checkRelease,
} from './release-pr.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'release-pr.mjs');

// Fake `run`: respostas por prefixo do comando ("git diff", "gh pr list", ...).
const fakeRun = (routes) => {
  const calls = [];
  const run = (cmd, args) => {
    const key = [cmd, ...args].join(' ');
    calls.push({ cmd, args });
    const hit = routes.find(([prefix]) => key.startsWith(prefix));
    if (!hit) return { status: 1, stdout: '', stderr: `sem rota para: ${key}` };
    const res = hit[1];
    return typeof res === 'function' ? res(args) : res;
  };
  return { run, calls };
};

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const fail = (stderr = '') => ({ status: 1, stdout: '', stderr });

const FETCH = ['git fetch', ok()];
const DIFFERS = ['git diff --quiet', fail()];
const NO_OPEN_PR = ['gh pr list', ok('0\n')];
const MAIN_TREE = ['git rev-parse origin/main^{tree}', ok('T0\n')];
const LOG = ['git log --first-parent', ok('T1\tfeat: nova tela\nT0\tfix: antigo\n')];

test('checkRelease: no content diff -> none and gh is never called', () => {
  const { run, calls } = fakeRun([FETCH, ['git diff --quiet', ok()]]);
  assert.deepEqual(checkRelease({ run }), { action: 'none' });
  assert.equal(
    calls.some((c) => c.cmd === 'gh'),
    false,
  );
});

test('checkRelease: diff with status other than 1 -> none', () => {
  const { run } = fakeRun([FETCH, ['git diff --quiet', fail('erro')]]);
  assert.deepEqual(checkRelease({ run }), { action: 'none' });
});

test('checkRelease: fetch fails -> none after a single call', () => {
  const { run, calls } = fakeRun([['git fetch', fail('offline')]]);
  assert.deepEqual(checkRelease({ run }), { action: 'none' });
  assert.equal(calls.length, 1);
});

test('checkRelease: release PR already open -> none, no pr create', () => {
  const { run, calls } = fakeRun([FETCH, DIFFERS, ['gh pr list', ok('1\n')]]);
  assert.deepEqual(checkRelease({ run }), { action: 'none' });
  assert.equal(
    calls.some((c) => c.cmd === 'gh' && c.args.includes('create')),
    false,
  );
});

test('checkRelease: gh pr list fails -> none', () => {
  const { run, calls } = fakeRun([FETCH, DIFFERS, ['gh pr list', fail('sem auth')]]);
  assert.deepEqual(checkRelease({ run }), { action: 'none' });
  assert.equal(
    calls.some((c) => c.cmd === 'gh' && c.args.includes('create')),
    false,
  );
});

test('checkRelease: differing content and no open PR -> creates the release PR', () => {
  const { run, calls } = fakeRun([
    FETCH,
    DIFFERS,
    NO_OPEN_PR,
    MAIN_TREE,
    LOG,
    ['gh pr create', ok('aviso qualquer\nhttps://github.com/o/r/pull/80\n')],
  ]);
  const result = checkRelease({ run });
  assert.deepEqual(result, { action: 'created', url: 'https://github.com/o/r/pull/80' });

  const create = calls.find((c) => c.cmd === 'gh' && c.args.includes('create'));
  const arg = (name) => create.args[create.args.indexOf(name) + 1];
  assert.equal(arg('--base'), 'main');
  assert.equal(arg('--head'), 'develop');
  assert.equal(arg('--title'), RELEASE_TITLE);
  assert.match(arg('--body'), /^- feat: nova tela$/m);
  assert.doesNotMatch(arg('--body'), /^- fix: antigo$/m);
});

test('checkRelease: adds Closes for issues resolved by the PRs of the release', () => {
  const { run, calls } = fakeRun([
    FETCH,
    DIFFERS,
    NO_OPEN_PR,
    MAIN_TREE,
    ['git log', ok('T1\tfeat: x (#97)\nT0\tfix: antigo\n')],
    ['gh pr view 97', ok('Resolve #95\nParte de #85')],
    ['gh pr create', ok('https://github.com/o/r/pull/82\n')],
  ]);
  assert.deepEqual(checkRelease({ run }), {
    action: 'created',
    url: 'https://github.com/o/r/pull/82',
  });
  const create = calls.find((c) => c.cmd === 'gh' && c.args.includes('create'));
  const body = create.args[create.args.indexOf('--body') + 1];
  assert.match(body, /^Closes #95$/m);
  assert.doesNotMatch(body, /Closes #85/);
});

test('checkRelease: failed pr view is skipped and the PR is still created', () => {
  const { run, calls } = fakeRun([
    FETCH,
    DIFFERS,
    NO_OPEN_PR,
    MAIN_TREE,
    ['git log', ok('T1\tfeat: x (#97)\n')],
    ['gh pr view 97', fail('not found')],
    ['gh pr create', ok('https://github.com/o/r/pull/83\n')],
  ]);
  assert.equal(checkRelease({ run }).action, 'created');
  const create = calls.find((c) => c.cmd === 'gh' && c.args.includes('create'));
  const body = create.args[create.args.indexOf('--body') + 1];
  assert.doesNotMatch(body, /Closes #/);
});

test('checkRelease: dryRun never calls gh pr view', () => {
  const { run, calls } = fakeRun([
    FETCH,
    DIFFERS,
    NO_OPEN_PR,
    MAIN_TREE,
    ['git log', ok('T1\tfeat: x (#97)\n')],
  ]);
  checkRelease({ run, dryRun: true });
  assert.equal(
    calls.some((c) => c.cmd === 'gh' && c.args.includes('view')),
    false,
  );
});

test('checkRelease: dryRun -> returns subjects and never calls pr create', () => {
  const { run, calls } = fakeRun([FETCH, DIFFERS, NO_OPEN_PR, MAIN_TREE, LOG]);
  assert.deepEqual(checkRelease({ run, dryRun: true }), {
    action: 'dry-run',
    subjects: ['feat: nova tela'],
  });
  assert.equal(
    calls.some((c) => c.cmd === 'gh' && c.args.includes('create')),
    false,
  );
});

test('checkRelease: log failure still creates the PR with an empty list', () => {
  const { run } = fakeRun([
    FETCH,
    DIFFERS,
    NO_OPEN_PR,
    MAIN_TREE,
    ['git log', fail('erro')],
    ['gh pr create', ok('https://github.com/o/r/pull/81\n')],
  ]);
  assert.deepEqual(checkRelease({ run }), {
    action: 'created',
    url: 'https://github.com/o/r/pull/81',
  });
});

test('checkRelease: pr create fails -> error with stderr text', () => {
  const { run } = fakeRun([
    FETCH,
    DIFFERS,
    NO_OPEN_PR,
    MAIN_TREE,
    LOG,
    ['gh pr create', fail('GraphQL: sem permissão\n')],
  ]);
  assert.deepEqual(checkRelease({ run }), {
    action: 'error',
    message: 'GraphQL: sem permissão',
  });
});

test('checkRelease: pr create loses a race ("already exists") -> none', () => {
  const { run } = fakeRun([
    FETCH,
    DIFFERS,
    NO_OPEN_PR,
    MAIN_TREE,
    LOG,
    [
      'gh pr create',
      fail('a pull request for branch "develop" into branch "main" Already Exists\n'),
    ],
  ]);
  assert.deepEqual(checkRelease({ run }), { action: 'none' });
});

test('pendingSubjects: stops at the commit whose tree equals main tree', () => {
  const log = 'T1\tfeat: a\nT2\tfeat: b\nT0\tfeat: antiga\n';
  assert.deepEqual(pendingSubjects(log, 'T2'), ['feat: a']);
});

test('pendingSubjects: no matching tree -> all subjects', () => {
  const log = 'T1\tfeat: a\nT2\tfeat: b\n';
  assert.deepEqual(pendingSubjects(log, 'TX'), ['feat: a', 'feat: b']);
});

test('pendingSubjects: handles CRLF and blank lines', () => {
  const log = 'T1\tfeat: a\r\n\r\nT2\tfeat: b\r\n\r\nT0\told\r\n';
  assert.deepEqual(pendingSubjects(log, 'T0'), ['feat: a', 'feat: b']);
});

test('pendingSubjects: empty log -> empty list', () => {
  assert.deepEqual(pendingSubjects('', 'T0'), []);
});

test('prNumbers: reads the (#N) at the end of each subject', () => {
  assert.deepEqual(prNumbers(['feat(web): x (#97)', 'chore: y']), [97]);
});

test('prNumbers: ignores repeated numbers and numbers not at the end', () => {
  assert.deepEqual(prNumbers(['a (#97)', 'b (#97)', 'c (#12) extra']), [97]);
});

test('resolvedIssues: counts closing keywords and ignores "Parte de"', () => {
  assert.deepEqual(resolvedIssues('Resolve #95\nParte de #85'), [95]);
});

test('resolvedIssues: case-insensitive, no repeats, sorted', () => {
  assert.deepEqual(resolvedIssues('closes #96\nFixed #95\nresolves #96'), [95, 96]);
});

test('buildReleaseBody: lists Closes for each delivered issue', () => {
  const body = buildReleaseBody(['a'], [95, 96]);
  assert.match(body, /^## Fecha$/m);
  assert.match(body, /^Closes #95$/m);
  assert.match(body, /^Closes #96$/m);
});

test('buildReleaseBody: no Fecha section when there are no issues', () => {
  const body = buildReleaseBody(['a']);
  assert.doesNotMatch(body, /## Fecha/);
  assert.doesNotMatch(body, /Closes #/);
});

test('buildReleaseBody: describes the merge guards and no human approval', () => {
  const body = buildReleaseBody(['a'], [95]);
  assert.match(body, /--match-head-commit/);
  assert.match(body, /janela do culto/);
  assert.doesNotMatch(body, /Antes de aprovar/);
});

test('buildReleaseBody: lists each subject as a bullet', () => {
  const body = buildReleaseBody(['feat: a', 'fix: b']);
  assert.match(body, /^- feat: a$/m);
  assert.match(body, /^- fix: b$/m);
});

test('buildReleaseBody: tells to use merge commit and has the Claude Code footer', () => {
  const body = buildReleaseBody(['feat: a']);
  assert.match(body, /Create a merge commit/);
  assert.match(body, /Generated with \[Claude Code\]\(https:\/\/claude\.com\/claude-code\)/);
});

test('buildReleaseBody: caps the list at 40 and reports the remainder', () => {
  const subjects = Array.from({ length: 45 }, (_, i) => `feat: item ${i + 1}`);
  const body = buildReleaseBody(subjects);
  assert.match(body, /^- feat: item 40$/m);
  assert.doesNotMatch(body, /^- feat: item 41$/m);
  assert.match(body, /^- …e mais 5 commit\(s\)$/m);
});

test('buildReleaseBody: empty list -> fallback line', () => {
  const body = buildReleaseBody([]);
  assert.match(body, /^- \(não consegui listar os commits; confira a aba Commits do PR\)$/m);
});

test('buildReleaseBody: keeps the pt-BR structure', () => {
  const body = buildReleaseBody(['feat: a']);
  assert.match(body, /^## Entra neste release$/m);
  assert.match(body, /^## Travas$/m);
  assert.match(body, /^- \[ \] CI verde \(checks e e2e\)$/m);
  assert.match(body, /^## Como fazer o merge$/m);
});

let tmp;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });
const commitFile = (cwd, content, message) => {
  writeFileSync(join(cwd, 'a.txt'), content);
  git(cwd, 'add', 'a.txt');
  git(
    cwd,
    '-c',
    'user.email=t@t',
    '-c',
    'user.name=t',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    message,
  );
};
const runScript = (input, cwd) => spawnSync('node', [script], { input, cwd, encoding: 'utf8' });

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'release-pr-'));
  const origin = join(tmp, 'origin.git');
  const work = join(tmp, 'work');
  mkdirSync(origin);
  git(origin, 'init', '--bare', '-b', 'main');
  mkdirSync(work);
  git(work, 'init', '-b', 'main');
  git(work, 'remote', 'add', 'origin', origin);
  commitFile(work, '1', 'chore: inicial');
  git(work, 'push', '-u', 'origin', 'main');
  git(work, 'checkout', '-b', 'develop');
  commitFile(work, '2', 'feat: mudança');
  git(work, 'push', '-u', 'origin', 'develop');
  git(work, 'checkout', 'main');
  commitFile(work, '2', 'feat: mudança (squash)');
  git(work, 'push', 'origin', 'main');
  // Agora origin/main..origin/develop tem 1 commit, mas o conteúdo é idêntico.
  mkdirSync(join(tmp, 'not-a-repo'));
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('script: identical content after squash release -> silent, no gh call', () => {
  const r = runScript(JSON.stringify({ cwd: join(tmp, 'work') }), join(tmp, 'work'));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('script: stop_hook_active -> silent', () => {
  const input = JSON.stringify({ cwd: join(tmp, 'work'), stop_hook_active: true });
  const r = runScript(input, join(tmp, 'work'));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('script: invalid JSON outside a git repo -> silent and exit 0', () => {
  const r = runScript('not json', join(tmp, 'not-a-repo'));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
