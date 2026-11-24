import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const uiDir = import.meta.dirname;
const css = readFileSync(resolve(uiDir, 'redesign-setlists.css'), 'utf8');
const screen49 = readFileSync(resolve(uiDir, '../setlists/SetlistNotFound.tsx'), 'utf8');

/** Declarações do primeiro seletor exato `.classe` (sem comentários). */
const ruleFor = (selector: string) =>
  new RegExp(`\\.${selector}\\s*{([^}]*)}`).exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '';

describe('tela 49 · corpo sem cartão (cascata)', () => {
  it('o corpo não tem borda nem fundo', () => {
    const rule = ruleFor('setlist-not-found-body');
    expect(rule).not.toMatch(/\bborder\b/);
    expect(rule).not.toMatch(/\bbackground\b/);
  });

  it('o corpo mantém a coluna centralizada e o espaço de 28 px', () => {
    const rule = ruleFor('setlist-not-found-body');
    expect(rule).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/flex-direction:\s*column/);
    expect(rule).toMatch(/gap:\s*28px/);
  });

  it('o componente não combina o corpo com .empty-card', () => {
    expect(screen49).toContain('className="setlist-not-found-body"');
    expect(screen49).not.toMatch(/empty-card/);
  });
});
