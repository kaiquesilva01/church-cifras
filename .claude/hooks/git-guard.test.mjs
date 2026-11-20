import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const hooksDir = dirname(fileURLToPath(import.meta.url));
const script = join(hooksDir, 'git-guard.mjs');
const GIT_FLAGS = ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false'];

let tmp; // repositório principal (branch main, origin com develop)
let remote; // remote bare da tmp
let fakeBin; // diretório com o `gh` falso
let fakeOut; // JSON que o `gh pr view` falso imprime
let fakeDiff; // lista que o `gh pr diff --name-only` falso imprime
let fakeIssues; // JSON que o `gh issue list` falso imprime

const gitIn = (cwd, ...args) => execFileSync('git', [...GIT_FLAGS, ...args], { cwd, stdio: 'pipe' });
const git = (...args) => gitIn(tmp, ...args);
const run = (input) => spawnSync('node', [script], { input, cwd: tmp, encoding: 'utf8' });
const payload = (command, cwd = tmp) => JSON.stringify({ tool_input: { command }, cwd });

// Preload: quando o `gh` falso roda, imprime o arquivo da variável certa e encerra.
// Carregado por NODE_OPTIONS só nos testes do fake. O argv do gh chega como `pr view ...`, mas o node
// trata o primeiro token como script (argv[1] vira caminho absoluto); por isso a busca é por tokens.
// O hook também herda o preload, mas o argv dele não tem nenhum desses tokens.
const PRELOAD = `const { readFileSync, writeSync } = require('node:fs');
const s = ' ' + process.argv.slice(1).join(' ') + ' ';
const source = s.includes(' diff ') ? 'FAKE_GH_DIFF' : s.includes(' --label ') ? 'FAKE_GH_ISSUES' : s.includes(' --json ') ? 'FAKE_GH_OUT' : null;
if (source) {
  writeSync(1, readFileSync(process.env[source], 'utf8'));
  process.exit(0);
}
`;

const STUB_RULES = "export const evaluateCommand = () => ({ allow: false, reason: 'REGRAS-DA-DEVELOP' });\n";

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'git-guard-'));
  git('init', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'init');

  // origin/develop com as regras atuais: o merge carrega as regras daqui.
  remote = mkdtempSync(join(tmpdir(), 'git-guard-remote-'));
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'pipe' });
  git('remote', 'add', 'origin', remote);
  git('checkout', '-q', '-b', 'develop');
  mkdirSync(join(tmp, '.claude', 'hooks'), { recursive: true });
  copyFileSync(join(hooksDir, 'git-guard-rules.mjs'), join(tmp, '.claude', 'hooks', 'git-guard-rules.mjs'));
  git('add', '.claude');
  git('commit', '-q', '-m', 'develop: regras atuais');
  git('push', '-q', 'origin', 'develop');
  git('checkout', '-q', 'main');
  git('fetch', '-q');

  fakeBin = mkdtempSync(join(tmpdir(), 'fake-gh-'));
  fakeOut = join(fakeBin, 'gh-out.txt');
  fakeDiff = join(fakeBin, 'gh-diff.txt');
  fakeIssues = join(fakeBin, 'gh-issues.txt');
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
  rmSync(remote, { recursive: true, force: true });
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

test('evaluates firebase deploy', () => {
  const r = run(payload('npx firebase deploy'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /produção/);
});

test('firebase deploy outside a git repo is blocked (fail closed)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-guard-nonrepo-'));
  try {
    const r = spawnSync('node', [script], { input: payload('npx firebase deploy', dir), cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /deploy bloqueado/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('firebase emulators outside a git repo is allowed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-guard-nonrepo-'));
  try {
    const r = spawnSync('node', [script], { input: payload('npx firebase emulators:start', dir), cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /comando permitido/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('blocks gh pr merge when origin/develop is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-guard-noremote-'));
  try {
    gitIn(dir, 'init', '-q', '-b', 'main');
    gitIn(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
    const r = spawnSync('node', [script], { input: payload('gh pr merge 1 --squash', dir), cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /origin\/develop/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loads the stub rules that return REGRAS-DA-DEVELOP', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-guard-stub-'));
  const bare = mkdtempSync(join(tmpdir(), 'git-guard-bare-'));
  try {
    execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'pipe' });
    gitIn(dir, 'init', '-q', '-b', 'develop');
    mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'hooks', 'git-guard-rules.mjs'), STUB_RULES);
    gitIn(dir, 'add', '.claude');
    gitIn(dir, 'commit', '-q', '-m', 'stub rules');
    gitIn(dir, 'remote', 'add', 'origin', bare);
    gitIn(dir, 'push', '-q', 'origin', 'develop');
    gitIn(dir, 'fetch', '-q');
    const r = spawnSync('node', [script], { input: payload('gh pr merge 1 --squash', dir), cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /REGRAS-DA-DEVELOP/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

// --- gh com respostas reais (fake gh no PATH) ---

// Diff unificado completo, como `gh pr diff` (sem --name-only): uma seção por arquivo.
const diffOf = (path) =>
  `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-a\n+b\n`;
const renameDiff = (from, to) =>
  `diff --git a/${from} b/${to}\nsimilarity index 100%\nrename from ${from}\nrename to ${to}\n`;
const deleteDiff = (path) =>
  `diff --git a/${path} b/${path}\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/${path}\n+++ /dev/null\n@@ -1 +0,0 @@\n-a\n`;
const DEFAULT_DIFF = diffOf('apps/web/src/stats/StatsPage.tsx');
const OUTSIDE_WINDOW = '2026-11-20T15:00:00Z'; // sexta, 12h em Brasília: fora da janela do culto
const WORSHIP_WINDOW = '2026-11-19T20:00:00Z'; // quinta, 17h em Brasília: dentro da janela

const greenPr = (over = {}) => ({
  baseRefName: 'develop',
  headRefName: 'feat/95-x',
  headRefOid: 'abc',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'StatusContext', context: 'vercel', state: 'SUCCESS' },
  ],
  labels: [{ name: 'revisado' }, { name: 'qa-ok' }],
  changedFiles: 1,
  body: '',
  ...over,
});

const releasePr = (over = {}) => greenPr({ baseRefName: 'main', headRefName: 'develop', labels: [], ...over });

const fakeEnv = ({ diffPath = fakeDiff, now } = {}) => {
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const env = {
    ...process.env,
    [pathKey]: fakeBin + delimiter + process.env[pathKey],
    // Barras normais: NODE_OPTIONS consome as invertidas no Windows.
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require "${join(fakeBin, 'fake-gh-preload.cjs').replace(/\\/g, '/')}"`]
      .filter(Boolean)
      .join(' '),
    FAKE_GH_OUT: fakeOut,
    FAKE_GH_DIFF: diffPath,
    FAKE_GH_ISSUES: fakeIssues,
  };
  delete env.GIT_GUARD_NOW; // só o relógio pedido no teste vale
  if (now !== undefined) env.GIT_GUARD_NOW = now;
  return env;
};

// Roda o hook com o comando dado; `pr`, `diff`, `issues` são as respostas do gh falso.
// `diffPath` apontando para arquivo inexistente faz o `gh pr diff` falso falhar.
const ghRun = (command, { pr = greenPr(), diff = DEFAULT_DIFF, issues = '[]', diffPath, now } = {}) => {
  writeFileSync(fakeOut, typeof pr === 'string' ? pr : JSON.stringify(pr));
  writeFileSync(fakeDiff, diff);
  writeFileSync(fakeIssues, issues);
  return spawnSync('node', [script], {
    input: payload(command),
    cwd: tmp,
    encoding: 'utf8',
    env: fakeEnv({ diffPath, now }),
  });
};

const ghMerge = (opts) => ghRun('gh pr merge 2 --squash', opts);

test('real gh JSON: green CI and both labels -> allows the merge', () => {
  const r = ghMerge();
  assert.equal(r.status, 0, r.stderr);
});

test('real gh JSON: a pending StatusContext blocks the merge', () => {
  const pr = greenPr({
    statusCheckRollup: [
      { __typename: 'CheckRun', name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'StatusContext', context: 'vercel', state: 'PENDING' },
    ],
  });
  const r = ghMerge({ pr });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /CI não está verde/);
});

test('real gh pr diff: a guarded file listed anywhere in the diff blocks the merge', () => {
  const names = [...Array.from({ length: 119 }, (_, i) => `docs/n${i}.md`), '.claude/hooks/x.mjs'];
  const r = ghMerge({ pr: greenPr({ changedFiles: 120 }), diff: names.map(diffOf).join('') });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /travas/);
  assert.match(r.stderr, /\.claude\/hooks\/x\.mjs/);
});

test('real gh pr diff: a list whose count matches changedFiles is used as is', () => {
  const r = ghMerge({ pr: greenPr({ changedFiles: 2 }), diff: diffOf('docs/a.md') + diffOf('docs/b.md') });
  assert.equal(r.status, 0, r.stderr);
});

test('real gh pr diff: incomplete list blocks with a specific message', () => {
  const r = ghMerge({ pr: greenPr({ changedFiles: 2 }), diff: diffOf('docs/a.md') });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /A lista de arquivos do PR está incompleta \(1 de 2\)/);
});

test('real gh pr diff: a rename AGENTS.md -> docs/AGENTS.md is blocked as a guarded path', () => {
  const r = ghMerge({ pr: greenPr({ changedFiles: 1 }), diff: renameDiff('AGENTS.md', 'docs/AGENTS.md') });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /merge é da pessoa/);
});

test('real gh pr diff: a deletion of a guarded file is blocked', () => {
  const r = ghMerge({ pr: greenPr({ changedFiles: 1 }), diff: deleteDiff('AGENTS.md') });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /merge é da pessoa/);
});

test('real gh pr diff: a quoted (non-ASCII) guarded path is unquoted and blocked', () => {
  const diff =
    'diff --git "a/.claude/hooks/\\303\\247.mjs" "b/.claude/hooks/\\303\\247.mjs"\n' +
    '--- "a/.claude/hooks/\\303\\247.mjs"\n+++ "b/.claude/hooks/\\303\\247.mjs"\n@@ -1 +1 @@\n-a\n+b\n';
  const r = ghMerge({ pr: greenPr({ changedFiles: 1 }), diff });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\.claude\/hooks\/ç\.mjs/);
});

test('real gh pr diff: a file name with spaces is counted once and allowed', () => {
  const r = ghMerge({ pr: greenPr({ changedFiles: 1 }), diff: diffOf('docs/notas da semana.md') });
  assert.equal(r.status, 0, r.stderr);
});

test('real gh pr diff: a removed line that looks like a header is not a file', () => {
  const diff = 'diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -1 +1 @@\n--- a/AGENTS.md\n+x\n';
  const r = ghMerge({ pr: greenPr({ changedFiles: 1 }), diff });
  assert.equal(r.status, 0, r.stderr);
});

test('real gh pr diff: failing diff blocks the merge', () => {
  const r = ghMerge({ diffPath: join(fakeBin, 'nao-existe.txt') });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /base do PR/);
});

test('real gh JSON: statusCheckRollup that is not an array blocks', () => {
  const r = ghMerge({ pr: greenPr({ statusCheckRollup: null }) });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /base do PR/);
});

test('real gh JSON: invalid JSON blocks the merge', () => {
  const r = ghMerge({ pr: 'not json' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /base do PR/);
});

test('real gh JSON: missing qa-ok label blocks the merge', () => {
  const r = ghMerge({ pr: greenPr({ labels: [{ name: 'revisado' }] }) });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /qa-ok/);
});

test('release in the worship window is blocked', () => {
  const r = ghRun('gh pr merge 2 --merge --match-head-commit abc', { pr: releasePr(), now: WORSHIP_WINDOW });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Janela do culto/);
});

test('release blocked by an open incident that the PR does not close', () => {
  const r = ghRun('gh pr merge 2 --merge --match-head-commit abc', {
    pr: releasePr(),
    issues: '[{"number":7}]',
    now: OUTSIDE_WINDOW,
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /incidente aberto \(#7\)/);
});

test('release blocked when the incident list reaches the 100-item limit', () => {
  const issues = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ number: i + 1 })));
  const r = ghRun('gh pr merge 2 --merge --match-head-commit abc', {
    pr: releasePr(),
    issues,
    now: OUTSIDE_WINDOW,
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Não foi possível verificar incidentes/);
});

test('release allowed when the PR body closes the open incident', () => {
  const r = ghRun('gh pr merge 2 --merge --match-head-commit abc', {
    pr: releasePr({ body: 'Closes #7' }),
    issues: '[{"number":7}]',
    now: OUTSIDE_WINDOW,
  });
  assert.equal(r.status, 0, r.stderr);
});

test('release blocked when the incident check fails', () => {
  const r = ghRun('gh pr merge 2 --merge --match-head-commit abc', {
    pr: releasePr(),
    issues: 'not json',
    now: OUTSIDE_WINDOW,
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Não foi possível verificar incidentes/);
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

test('real gh pr diff: a release (base main) does not need the diff, so a failing diff still allows it', () => {
  const r = ghRun('gh pr merge 2 --merge --match-head-commit abc', {
    pr: releasePr(),
    diffPath: join(fakeBin, 'nao-existe.txt'),
    issues: '[]',
    now: OUTSIDE_WINDOW,
  });
  assert.equal(r.status, 0, r.stderr);
});

test('merge reads origin/develop after a fetch, so a newer develop rule applies', () => {
  // Outro clone publica regras novas (stub) na develop; o clone da tmp ainda tem as antigas.
  const clone = mkdtempSync(join(tmpdir(), 'git-guard-clone-'));
  try {
    execFileSync('git', ['clone', '-q', remote, clone], { stdio: 'pipe' });
    gitIn(clone, 'checkout', '-q', 'develop');
    writeFileSync(join(clone, '.claude', 'hooks', 'git-guard-rules.mjs'), STUB_RULES);
    gitIn(clone, 'commit', '-q', '-am', 'regras novas');
    gitIn(clone, 'push', '-q', 'origin', 'develop');
    const r = ghRun('gh pr merge 2 --merge --match-head-commit abc', { pr: releasePr(), issues: '[]', now: OUTSIDE_WINDOW });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /REGRAS-DA-DEVELOP/);
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
});
