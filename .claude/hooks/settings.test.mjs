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

// Texto de um bloco `run:` de um workflow (linhas mais indentadas que a chave `run:`).
const runBlocks = (yaml) => {
  const lines = yaml.split('\n');
  const blocks = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)(- )?run:/);
    if (!m) return;
    const indent = m[1].length + (m[2] ? 2 : 0);
    const body = [line];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (next.trim() !== '' && next.search(/\S/) <= indent) break;
      body.push(next);
    }
    blocks.push(body.join('\n'));
  });
  return blocks;
};

test('every firebase deploy in deploy.yml names its --only targets, none of them the test site', () => {
  const deploy = readFileSync(join(repoRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
  const lines = deploy.split('\n').filter((l) => l.includes('firebase deploy'));
  assert.ok(lines.length >= 1, 'deploy.yml sem firebase deploy');
  for (const line of lines) {
    const only = line.match(/--only\s+(\S+)/);
    assert.ok(only, `firebase deploy sem --only: ${line.trim()}`);
    assert.ok(!only[1].includes('louvor-hajaluz-teste'), 'produção não pode publicar o site de teste');
  }
});

test('site-teste.yml guards both jobs with the main ref and reads inputs only through env', () => {
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'site-teste.yml'), 'utf8');
  const guard = "if: github.ref == 'refs/heads/main'";
  const buildJob = workflow.slice(workflow.search(/^ {2}build:/m), workflow.search(/^ {2}deploy:/m));
  const deployJob = workflow.slice(workflow.search(/^ {2}deploy:/m));
  assert.ok(buildJob.includes(guard), 'o job build precisa da guarda da main');
  assert.ok(deployJob.includes(guard), 'o job deploy precisa da guarda da main');
  assert.ok(workflow.split(guard).length - 1 >= 2, 'guarda da main em pelo menos 2 jobs');
  for (const block of runBlocks(workflow)) {
    assert.ok(!block.includes('inputs.'), `run não pode interpolar inputs: ${block.split('\n')[0]}`);
  }
});

test('site-teste build checkout does not persist the token', () => {
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'site-teste.yml'), 'utf8');
  const buildJob = workflow.slice(workflow.search(/^ {2}build:/m), workflow.search(/^ {2}deploy:/m));
  const checkout = buildJob.slice(buildJob.indexOf('actions/checkout@v4'));
  assert.match(checkout.slice(0, checkout.indexOf('\n      - ', 1)), /persist-credentials: false/);
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

test('AGENTS.md documents the SDLC por issue', () => {
  for (const x of [
    'entregar-issue',
    'Análise Agêntica',
    '16h30',
    'teste-celular-ok',
    'revisado',
    'qa-ok',
    'docs/sistema.md',
    'site-teste.yml',
    '--match-head-commit',
    'hosting:louvor-hajaluz,hosting:cifras-louvor-5dd50',
    'instruções deste arquivo valem mais que as skills',
  ]) {
    assert.ok(agents.includes(x), `AGENTS.md sem "${x}"`);
  }
  assert.match(agents, /\|[^|\n]*implementação[^|\n]*\|\s*Haiku\s*\|\s*low\s*\|/, 'tabela de modelos sem Haiku low');
  assert.match(agents, /último release[^\n]*à mão/, 'AGENTS.md não diz que o release desta mudança é o último à mão');
});
