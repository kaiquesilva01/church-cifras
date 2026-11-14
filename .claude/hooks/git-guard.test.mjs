import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'git-guard.mjs');
let tmp;

const git = (...args) => execFileSync('git', args, { cwd: tmp, stdio: 'pipe' });
const run = (input) =>
  spawnSync('node', [script], { input, cwd: tmp, encoding: 'utf8' });
const payload = (command) => JSON.stringify({ tool_input: { command }, cwd: tmp });

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'git-guard-'));
  git('init', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
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

test('fails open on invalid input', () => {
  const r = run('not json');
  assert.equal(r.status, 0);
  assert.match(r.stderr, /git-guard/);
});

test('allows non-git commands', () => {
  const r = run(JSON.stringify({ tool_input: { command: 'ls' } }));
  assert.equal(r.status, 0);
});
