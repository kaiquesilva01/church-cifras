import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
  git('-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'init');
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
