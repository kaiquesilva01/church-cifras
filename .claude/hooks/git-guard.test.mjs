import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'git-guard.mjs');
let tmp;
let fakeBin; // diretório com um `gh` falso que responde com o JSON de FAKE_GH_OUT
let fakeOut;

const git = (...args) => execFileSync('git', args, { cwd: tmp, stdio: 'pipe' });
const run = (input) =>
  spawnSync('node', [script], { input, cwd: tmp, encoding: 'utf8' });
const payload = (command) => JSON.stringify({ tool_input: { command }, cwd: tmp });

// Preload: quando o `gh` falso roda (argv com --json), imprime FAKE_GH_OUT e encerra.
// Carregado por NODE_OPTIONS só nos testes do fake; o hook não tem --json, então não é afetado.
const PRELOAD = `const { readFileSync, writeSync } = require('node:fs');
if (process.argv.includes('--json')) {
  writeSync(1, readFileSync(process.env.FAKE_GH_OUT, 'utf8'));
  process.exit(0);
}
`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'git-guard-'));
  git('init', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'init');

  fakeBin = mkdtempSync(join(tmpdir(), 'fake-gh-'));
  fakeOut = join(fakeBin, 'gh-out.txt');
  const preload = join(fakeBin, 'fake-gh-preload.cjs');
  writeFileSync(preload, PRELOAD);
  // POSIX: shim shell. Windows: execFile não roda .cmd, então o gh.exe é uma cópia do node.
  const shim = join(fakeBin, 'gh');
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "$@"\n`);
  chmodSync(shim, 0o755);
  if (process.platform === 'win32') copyFileSync(process.execPath, join(fakeBin, 'gh.exe'));
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(fakeBin, { recursive: true, force: true });
});

test('blocks commit on main via stdin', () => {
  const r = run(payload('git commit -m x'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /origin\/develop/);
});

test('allows commit on feature branch via stdin', () => {
  git('checkout', '-b', 'feat/a');
  const r = run(payload('git commit -m x'));
  assert.equal(r.status, 0);
});

test('blocks staged pdf via stdin', () => {
  writeFileSync(join(tmp, 'a.pdf'), 'x');
  git('add', '-f', 'a.pdf');
  const r = run(payload('git commit -m x'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /PDF/);
});

test('blocks staged pdf with accented name via stdin', () => {
  git('reset', '-q');
  mkdirSync(join(tmp, 'fixtures'), { recursive: true });
  writeFileSync(join(tmp, 'fixtures', 'Ação de Graças.pdf'), 'x');
  git('add', '-f', 'fixtures/Ação de Graças.pdf');
  const r = run(payload('git commit -m x'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /PDF/);
  git('reset', '-q');
});

test('reminds to run tests when pr create is allowed', () => {
  const r = run(payload('gh pr create --base develop --title t'));
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.systemMessage, /Lembrete: rode os testes/);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.additionalContext, out.systemMessage);
});

test('blocks powershell chained push via stdin', () => {
  const r = run(payload('git commit -m x; if ($?) { git push origin develop --dry-run }'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Push para/);
});

test('fails open on invalid input', () => {
  const r = run('not json');
  assert.equal(r.status, 0);
  assert.match(r.stderr, /git-guard/);
});

test('allows non-git commands', () => {
  const r = run(JSON.stringify({ tool_input: { command: 'ls' } }));
  assert.equal(r.status, 0);
});

test('blocks gh pr merge when base cannot be resolved', () => {
  const r = run(payload('gh pr merge 1 --squash'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /base do PR/);
});

// --- gh pr view com JSON real (fake gh no PATH) ---

const greenPr = (over = {}) => ({
  baseRefName: 'develop',
  headRefName: 'feat/95-x',
  headRefOid: 'abc',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'StatusContext', context: 'vercel', state: 'SUCCESS' },
  ],
  labels: [{ name: 'revisado' }, { name: 'qa-ok' }],
  files: [{ path: 'apps/web/src/stats/StatsPage.tsx' }],
  changedFiles: 1,
  body: '',
  ...over,
});

const fakeEnv = () => {
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  return {
    ...process.env,
    [pathKey]: fakeBin + delimiter + process.env[pathKey],
    // Barras normais: NODE_OPTIONS consome as invertidas no Windows.
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require "${join(fakeBin, 'fake-gh-preload.cjs').replace(/\\/g, '/')}"`]
      .filter(Boolean)
      .join(' '),
    FAKE_GH_OUT: fakeOut,
  };
};

// `out` é o texto que o gh falso imprime (JSON ou lixo).
const ghMerge = (out) => {
  writeFileSync(fakeOut, out);
  return spawnSync('node', [script], {
    input: payload('gh pr merge 2 --squash'),
    cwd: tmp,
    encoding: 'utf8',
    env: fakeEnv(),
  });
};

test('real gh JSON: green CI and both labels -> allows the merge', () => {
  const r = ghMerge(JSON.stringify(greenPr()));
  assert.equal(r.status, 0, r.stderr);
});

test('real gh JSON: a pending StatusContext blocks the merge', () => {
  const pr = greenPr({
    statusCheckRollup: [
      { __typename: 'CheckRun', name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'StatusContext', context: 'vercel', state: 'PENDING' },
    ],
  });
  const r = ghMerge(JSON.stringify(pr));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /CI não está verde/);
});

test('real gh JSON: missing files blocks the merge', () => {
  const { files, ...pr } = greenPr();
  const r = ghMerge(JSON.stringify(pr));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gh pr view/);
});

test('real gh JSON: truncated file list (files.length !== changedFiles) blocks', () => {
  const r = ghMerge(JSON.stringify(greenPr({ files: [{ path: 'docs/a.md' }], changedFiles: 2 })));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gh pr view/);
});

test('real gh JSON: statusCheckRollup that is not an array blocks', () => {
  const r = ghMerge(JSON.stringify(greenPr({ statusCheckRollup: null })));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gh pr view/);
});

test('real gh JSON: invalid JSON blocks the merge', () => {
  const r = ghMerge('not json');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gh pr view/);
});

test('real gh JSON: missing qa-ok label blocks the merge', () => {
  const r = ghMerge(JSON.stringify(greenPr({ labels: [{ name: 'revisado' }] })));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /qa-ok/);
});

test('an unexpected error while evaluating a merge blocks it (fail closed)', () => {
  const nogit = mkdtempSync(join(tmpdir(), 'git-guard-nogit-'));
  try {
    const input = (command) => JSON.stringify({ tool_input: { command }, cwd: nogit });
    const merge = spawnSync('node', [script], { input: input('gh pr merge 2 --squash'), cwd: tmp, encoding: 'utf8' });
    assert.equal(merge.status, 2);
    assert.match(merge.stderr, /merge bloqueado/);

    const other = spawnSync('node', [script], { input: input('git status'), cwd: tmp, encoding: 'utf8' });
    assert.equal(other.status, 0);
    assert.match(other.stderr, /comando permitido/);
  } finally {
    rmSync(nogit, { recursive: true, force: true });
  }
});
