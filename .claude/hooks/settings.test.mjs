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

test('deploy checks the new version and rolls back on failure', () => {
  const deploy = readFileSync(join(repoRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
  for (const x of [
    'VITE_APP_VERSION: ${{ github.sha }}',
    'EXPECTED_VERSION: ${{ github.sha }}',
    'npm run smoke -w @cifras/e2e',
    'github.event.before',
    '--label incidente',
    'issues: write',
    'actions: read',
    '--status success',
    '--only hosting:louvor-hajaluz,hosting:cifras-louvor-5dd50,functions,firestore,storage',
    'npm exec -w @cifras/e2e -- playwright install --with-deps chromium',
    'gh label create incidente',
    '(failure() || cancelled())',
    'A checagem falhou; sem volta automática (execução manual)',
    'gh run list --workflow deploy.yml --branch main --status success --limit 1',
    '// empty',
    'sem commit verde para voltar',
    'gh label create incidente --color b60205 --description "Deploy ou checagem falhou em produção" --force || true',
  ]) {
    assert.ok(deploy.includes(x), `deploy.yml sem "${x}"`);
  }
});

test('deploy installs chromium before the deploy so a failed install cannot skip the check', () => {
  const deploy = readFileSync(join(repoRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
  assert.ok(
    deploy.indexOf('playwright install') < deploy.indexOf('Deploy no Firebase'),
    'o Chromium precisa ser instalado antes do deploy',
  );
});

test('test site is deployed only from main, with the build job holding no secrets', () => {
  const firebase = JSON.parse(readFileSync(join(repoRoot, 'firebase.json'), 'utf8'));
  const site = firebase.hosting.find((s) => s.site === 'louvor-hajaluz-teste');
  assert.ok(site, 'firebase.json sem o site louvor-hajaluz-teste');
  assert.equal(site.public, 'apps/web/dist');

  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'site-teste.yml'), 'utf8');
  for (const x of [
    'workflow_dispatch',
    "github.ref == 'refs/heads/main'",
    'hosting:louvor-hajaluz-teste',
    'VITE_TEST_BANNER',
  ]) {
    assert.ok(workflow.includes(x), `site-teste.yml sem "${x}"`);
  }
  const buildJob = workflow.slice(workflow.indexOf('build:'), workflow.indexOf('deploy:'));
  assert.ok(buildJob.length > 0, 'site-teste.yml sem os jobs build e deploy');
  assert.ok(!buildJob.includes('secrets.'), 'o job build não pode referenciar secrets');

  const cors = JSON.parse(readFileSync(join(repoRoot, 'cors.json'), 'utf8'));
  assert.ok(cors[0].origin.includes('https://louvor-hajaluz-teste.web.app'));
});

test('the project session opens on sonnet medium', () => {
  assert.equal(settings.model, 'sonnet');
  assert.equal(settings.effortLevel, 'medium');
  assert.equal(settings.modelSettings['claude-sonnet-5-5'].effortLevel, 'medium');
});

test('AGENTS.md documents the release hook, the sync hook and the merge commit rule', () => {
  assert.match(agents, /release-pr\.mjs/);
  assert.match(agents, /sync-main\.mjs/);
  assert.match(agents, /Create a merge commit/);
  assert.match(agents, /chore\/merge-main-into-develop/);
  assert.match(agents, /--merge/);
});
