import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');

const commandsOf = (event) =>
  (settings.hooks[event] ?? []).flatMap((group) => group.hooks.map((h) => h.command));

test('PreToolUse runs git-guard for Bash|PowerShell', () => {
  const groups = settings.hooks.PreToolUse;
  assert.equal(groups.length, 1);
  assert.equal(groups[0].matcher, 'Bash|PowerShell');
  assert.match(commandsOf('PreToolUse')[0], /git-guard\.mjs/);
});

test('Stop runs release-pr.mjs', () => {
  assert.equal(commandsOf('Stop').length, 1);
  assert.match(commandsOf('Stop')[0], /release-pr\.mjs/);
});

test('SessionStart runs sync-main.mjs', () => {
  assert.equal(commandsOf('SessionStart').length, 1);
  assert.match(commandsOf('SessionStart')[0], /sync-main\.mjs/);
});

test('every hook script referenced by settings exists in the repo', () => {
  const commands = Object.keys(settings.hooks).flatMap((event) => commandsOf(event));
  const scripts = commands.map((cmd) => cmd.match(/\$CLAUDE_PROJECT_DIR\/(\S+?\.mjs)/)?.[1]);
  assert.ok(scripts.every(Boolean), 'todo comando de hook aponta para um .mjs do projeto');
  for (const script of scripts) {
    assert.ok(existsSync(join(repoRoot, script)), `${script} não existe`);
  }
});

test('deploy skips pushes that only touch harness, docs or tests', () => {
  const deploy = readFileSync(join(repoRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
  const ignored = ['.claude/**', 'docs/**', '*.md', 'e2e/**', 'tests/**'];
  assert.match(deploy, /paths-ignore:/);
  for (const pattern of ignored) {
    assert.ok(deploy.includes(`- '${pattern}'`), `${pattern} fora do paths-ignore`);
  }
});

test('AGENTS.md documents the release hook, the sync hook and the merge commit rule', () => {
  assert.match(agents, /release-pr\.mjs/);
  assert.match(agents, /sync-main\.mjs/);
  assert.match(agents, /Create a merge commit/);
  assert.match(agents, /chore\/merge-main-into-develop/);
  assert.match(agents, /--merge/);
});
