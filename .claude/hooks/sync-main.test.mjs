import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncMain } from './sync-main.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'sync-main.mjs');

// Fake `run`: respostas por prefixo do comando ("git status", "git fetch", ...).
const fakeRun = (routes) => {
  const calls = [];
  const run = (cmd, args) => {
    const key = [cmd, ...args].join(' ');
    calls.push({ cmd, args });
    const hit = routes.find(([prefix]) => key.startsWith(prefix));
    if (!hit) return { status: 1, stdout: '', stderr: `sem rota para: ${key}` };
    return hit[1];
  };
  return { run, calls };
};

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const fail = (stderr = '', status = 1) => ({ status, stdout: '', stderr });

const ON_MAIN = ['git rev-parse --abbrev-ref', ok('main\n')];
const CLEAN = ['git status --porcelain', ok('')];
const FETCHED = ['git fetch', ok()];
const HEAD_A = ['git rev-parse HEAD', ok('aaaaaaa1111111111111111111111111111111111\n')];
const REMOTE_B = ['git rev-parse origin/main', ok('bbbbbbb2222222222222222222222222222222222\n')];
const ANCESTOR = ['git merge-base --is-ancestor', ok()];

test('syncMain: not on main -> none after exactly one call', () => {
  const { run, calls } = fakeRun([['git rev-parse --abbrev-ref', ok('develop\n')]]);
  assert.deepEqual(syncMain({ run }), { action: 'none' });
  assert.equal(calls.length, 1);
});

test('syncMain: rev-parse of branch fails -> none', () => {
  const { run } = fakeRun([['git rev-parse --abbrev-ref', fail('não é repo')]]);
  assert.deepEqual(syncMain({ run }), { action: 'none' });
});

test('syncMain: local changes on main -> warn, no merge', () => {
  const { run, calls } = fakeRun([
    ON_MAIN,
    ['git status --porcelain', ok(' M apps/web/x.ts\n')],
  ]);
  assert.deepEqual(syncMain({ run }), {
    action: 'warn',
    message: 'Checkout na main com alterações locais: não atualizei com origin/main.',
  });
  assert.equal(
    calls.some((c) => c.args.includes('merge')),
    false,
  );
});

test('syncMain: git status fails -> none', () => {
  const { run } = fakeRun([ON_MAIN, ['git status', fail('erro')]]);
  assert.deepEqual(syncMain({ run }), { action: 'none' });
});

test('syncMain: fetch fails (offline) -> none', () => {
  const { run } = fakeRun([ON_MAIN, CLEAN, ['git fetch', fail('offline')]]);
  assert.deepEqual(syncMain({ run }), { action: 'none' });
});

test('syncMain: already up to date -> none', () => {
  const { run } = fakeRun([
    ON_MAIN,
    CLEAN,
    FETCHED,
    ['git rev-parse HEAD', ok('ccc\n')],
    ['git rev-parse origin/main', ok('ccc\n')],
  ]);
  assert.deepEqual(syncMain({ run }), { action: 'none' });
});

test('syncMain: rev-parse of HEAD fails -> none', () => {
  const { run } = fakeRun([
    ON_MAIN,
    CLEAN,
    FETCHED,
    ['git rev-parse HEAD', fail('erro')],
    REMOTE_B,
  ]);
  assert.deepEqual(syncMain({ run }), { action: 'none' });
});

test('syncMain: diverged main -> warn, no merge', () => {
  const { run, calls } = fakeRun([
    ON_MAIN,
    CLEAN,
    FETCHED,
    HEAD_A,
    REMOTE_B,
    ['git merge-base --is-ancestor', fail('', 1)],
  ]);
  assert.deepEqual(syncMain({ run }), {
    action: 'warn',
    message: 'A main local divergiu de origin/main: não atualizei.',
  });
  assert.equal(
    calls.some((c) => c.args.includes('merge')),
    false,
  );
});

test('syncMain: is-ancestor unexpected status -> none', () => {
  const { run } = fakeRun([
    ON_MAIN,
    CLEAN,
    FETCHED,
    HEAD_A,
    REMOTE_B,
    ['git merge-base --is-ancestor', fail('', 128)],
  ]);
  assert.deepEqual(syncMain({ run }), { action: 'none' });
});

test('syncMain: behind origin/main -> fast-forward and report 7-char shas', () => {
  const { run, calls } = fakeRun([
    ON_MAIN,
    CLEAN,
    FETCHED,
    HEAD_A,
    REMOTE_B,
    ANCESTOR,
    ['git merge --ff-only', ok()],
  ]);
  assert.deepEqual(syncMain({ run }), { action: 'updated', from: 'aaaaaaa', to: 'bbbbbbb' });
  const merge = calls.find((c) => c.args[0] === 'merge');
  assert.deepEqual(merge.args, ['merge', '--ff-only', '--quiet', 'origin/main']);
});

test('syncMain: fast-forward fails -> warn with first stderr line', () => {
  const { run } = fakeRun([
    ON_MAIN,
    CLEAN,
    FETCHED,
    HEAD_A,
    REMOTE_B,
    ANCESTOR,
    ['git merge --ff-only', fail('\nfatal: não é possível avançar\nmais detalhes\n', 128)],
  ]);
  assert.deepEqual(syncMain({ run }), {
    action: 'warn',
    message: 'Não consegui atualizar a main (fast-forward): fatal: não é possível avançar',
  });
});

let tmp;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });
const commitFile = (cwd, name, content, message) => {
  writeFileSync(join(cwd, name), content);
  git(cwd, 'add', name);
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
const runScript = (input) => spawnSync('node', [script], { input, cwd: tmp, encoding: 'utf8' });

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sync-main-'));
  const origin = join(tmp, 'origin.git');
  const a = join(tmp, 'a');
  mkdirSync(origin);
  git(origin, 'init', '--bare', '-b', 'main');
  mkdirSync(a);
  git(a, 'init', '-b', 'main');
  git(a, 'remote', 'add', 'origin', origin);
  commitFile(a, 'a.txt', '1', 'chore: inicial');
  git(a, 'push', '-u', 'origin', 'main');
  // Clone B fica para trás quando A publica mais um commit.
  git(tmp, 'clone', '--quiet', origin, join(tmp, 'b'));
  commitFile(a, 'a.txt', '2', 'feat: segunda');
  git(a, 'push', 'origin', 'main');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('script: behind main on startup -> fast-forwards and reports it', () => {
  const b = join(tmp, 'b');
  const r = runScript(JSON.stringify({ cwd: b, source: 'startup' }));
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.systemMessage, /atualizado/);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(out.hookSpecificOutput.additionalContext, out.systemMessage);
  assert.equal(git(b, 'rev-parse', 'HEAD'), git(b, 'rev-parse', 'origin/main'));
});

// Mesmo script, caminho que difere só na forma: no Windows, letra do drive com outra caixa e
// "/" no lugar de "\"; nos demais, um segmento redundante ("./").
const scriptPathVariant = () => {
  if (process.platform === 'win32') {
    const [d] = script;
    const flipped = d === d.toLowerCase() ? d.toUpperCase() : d.toLowerCase();
    return (flipped + script.slice(1)).replaceAll('\\', '/');
  }
  return join(dirname(script), '.', 'sync-main.mjs');
};

test('script: runs when launched through a path that differs only in form', () => {
  const variant = scriptPathVariant();
  assert.notEqual(variant, script);
  const c = join(tmp, 'c');
  git(tmp, 'clone', '--quiet', join(tmp, 'origin.git'), c);
  git(c, 'reset', '--quiet', '--hard', 'HEAD~1');
  const r = spawnSync('node', [variant], {
    input: JSON.stringify({ cwd: c, source: 'startup' }),
    cwd: tmp,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /atualizado/);
  assert.equal(git(c, 'rev-parse', 'HEAD'), git(c, 'rev-parse', 'origin/main'));
});

test('script: checkout on a feature branch is left alone', () => {
  const b = join(tmp, 'b');
  git(b, 'checkout', '-b', 'feat/x');
  const r = runScript(JSON.stringify({ cwd: b, source: 'startup' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('script: source compact -> silent and does not touch the checkout', () => {
  const b = join(tmp, 'b');
  git(b, 'checkout', 'main');
  commitFile(join(tmp, 'a'), 'a.txt', '3', 'feat: terceira');
  git(join(tmp, 'a'), 'push', 'origin', 'main');
  const before = git(b, 'rev-parse', 'HEAD');
  const r = runScript(JSON.stringify({ cwd: b, source: 'compact' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(git(b, 'rev-parse', 'HEAD'), before);
});
