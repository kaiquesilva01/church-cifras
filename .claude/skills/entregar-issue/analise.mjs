import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKER =
  '<!-- analise-agentica: tudo abaixo é escrito pelos agentes; o texto acima nunca é alterado -->';

const BODY_LIMIT = 65536;
// A linha `---` que precede o MARKER (com a quebra de linha do próprio texto, LF ou CRLF).
const SEPARATOR = /(^|\r?\n)---\r?\n$/;

// Texto original da issue: tudo antes do separador `---` que precede o último MARKER
// (o da ferramenta; um MARKER colado no texto original fica antes dele).
// Sem MARKER, a issue inteira (sem espaços finais).
export function originalText(body) {
  const at = body.lastIndexOf(MARKER);
  if (at === -1) return body.trimEnd();
  return body.slice(0, at).replace(SEPARATOR, '').trimEnd();
}

// Monta o corpo: texto original intocado + separador + MARKER + seção nova.
// Reexecutar substitui a seção anterior, nunca acumula.
export function spliceAnalysis(body, section) {
  if (section.includes(MARKER)) {
    throw new Error('a Análise Agêntica não pode conter o marcador da ferramenta');
  }
  const original = originalText(body);
  const head = original ? `${original}\n\n` : '';
  const out = `${head}---\n${MARKER}\n${section.trim()}\n`;
  if (out.length > BODY_LIMIT) {
    throw new Error('Análise Agêntica passa do limite de 65.536 caracteres; resuma o Histórico');
  }
  return out;
}

function runCli([issue, file]) {
  if (!issue || !file) {
    throw new Error('uso: node .claude/skills/entregar-issue/analise.mjs <issue> <arquivo.md>');
  }
  let section;
  try {
    section = readFileSync(file, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw new Error(`arquivo não encontrado: ${file}`, { cause: err });
    }
    throw err;
  }
  const current = execFileSync('gh', ['issue', 'view', issue, '--json', 'body', '-q', '.body // ""'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const next = spliceAnalysis(current, section);

  const dir = mkdtempSync(join(tmpdir(), 'analise-'));
  const bodyFile = join(dir, 'body.md');
  try {
    writeFileSync(bodyFile, next, 'utf8');
    execFileSync('gh', ['issue', 'edit', issue, '--body-file', bodyFile], {
      encoding: 'utf8',
      windowsHide: true,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function describeError(err) {
  if (err?.code === 'ENOENT') return 'gh não encontrado no PATH';
  const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : '';
  return stderr || err?.message || 'erro desconhecido';
}

// Executado como script? Compara caminhos reais; no Windows sem diferenciar maiúsculas.
const samePath = (a, b) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const isMain = (() => {
  try {
    const self = realpathSync(fileURLToPath(import.meta.url));
    return samePath(self, realpathSync(resolve(process.argv[1] ?? '')));
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[analise] não consegui gravar a Análise Agêntica: ${describeError(err)}\n`);
    process.exitCode = 1;
  }
}
