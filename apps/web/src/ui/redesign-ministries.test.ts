import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const uiDir = import.meta.dirname;
const css = readFileSync(resolve(uiDir, 'redesign-ministries.css'), 'utf8');
const tokens = readFileSync(resolve(uiDir, 'styles.css'), 'utf8');

/** Classes de outro CSS que este arquivo reaproveita de propósito (sem redefinir). Vazio até haver um caso. */
const INTENTIONAL_REUSE: readonly string[] = [];

const has = (selector: string) => new RegExp(`\\.${selector}(?![\\w-])`).test(css);
const ruleFor = (selector: string) =>
  new RegExp(`\\.${selector}(?![\\w-])[^{]*{([^}]*)}`).exec(css)?.[1] ?? '';

/** Nomes de classe definidos num seletor (ignora comentários e conteúdo das declarações). */
function classesIn(source: string): Set<string> {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = withoutComments.replace(/@[^{]*{/g, '{').split(/[{};]/);
  const names = new Set<string>();
  for (const part of selectors) {
    for (const m of part.matchAll(/\.([a-zA-Z][\w-]*)/g)) names.add(m[1]!);
  }
  return names;
}

function cssFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.css') && !f.endsWith('redesign-ministries.css'))
    .map((f) => resolve(dir, f));
}

describe('redesign-ministries.css', () => {
  it('usa só tokens: nenhum #hex, rgb() ou hsl() solto', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });

  it('todo var(--token) usado existe em styles.css', () => {
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) expect(tokens).toContain(`${name}:`);
  });

  it('declara as classes do paper-spec §3 (com fronteira de nome)', () => {
    for (const cls of [
      'min-tile',
      'count-badge',
      'role-badge--member',
      'role-badge--admin',
      'role-badge--app',
      'mn-status-pill',
      'mn-role-select',
      'mn-role-select--yesno',
      'person-row',
      'request-card',
      'dest-chip',
      'action-menu',
      'sheet',
      'skeleton',
      'empty-card',
      'empty-card--search',
      'error-box',
      'entry-card',
      'entry-row',
      'entry-footer',
      'entry-alert',
      'entry-icon',
      'entry-sent',
      'mn-profile-card',
      'mn-profile-avatar',
      'section-eyebrow',
      'mn-section-title',
      'section-count',
    ]) {
      expect(has(cls), cls).toBe(true);
    }
  });

  it('nenhuma classe repete o nome de uma classe de outro CSS do app (exceto reuso explícito)', () => {
    const mine = classesIn(css);
    const clashes: string[] = [];
    for (const file of cssFilesUnder(uiDir.replace(/ui$/, ''))) {
      for (const name of classesIn(readFileSync(file, 'utf8'))) {
        if (mine.has(name) && !INTENTIONAL_REUSE.includes(name)) clashes.push(`${name} em ${file}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('count-badge: 24 px de altura, fundo âmbar e sem borda extra', () => {
    expect(ruleFor('count-badge')).toMatch(/height:\s*24px;/);
    expect(ruleFor('count-badge')).toMatch(/background:\s*var\(--color-accent\);/);
    expect(ruleFor('count-badge')).not.toMatch(/accent-border/);
  });

  it('mn-role-select: 36 px visuais e alvo de toque de 44 px; variante Sim/Não sem chevron com padding 14 px', () => {
    expect(ruleFor('mn-role-select')).toMatch(/height:\s*36px;/);
    expect(css).toMatch(/\.mn-role-select::before\s*{[^}]*height:\s*44px;/);
    expect(ruleFor('mn-role-select--yesno')).toMatch(/padding-inline:\s*14px;/);
  });

  it('request-card: Aprovar é 800 mesmo com a regra de botões do cartão', () => {
    expect(css).toMatch(
      /\.request-card-actions\s*>\s*\.request-card-approve\s*{[^}]*font-weight:\s*800;/,
    );
  });

  it('empty-card: base sem centralização; o modificador --search centraliza com raio 24 px', () => {
    expect(ruleFor('empty-card')).not.toMatch(/align-items|text-align/);
    expect(ruleFor('empty-card--search')).toMatch(/border-radius:\s*24px;/);
    expect(ruleFor('empty-card--search')).toMatch(/padding:\s*28px 20px;/);
    expect(ruleFor('empty-card--search')).toMatch(/text-align:\s*center;/);
  });

  it('action-menu: 216 px e limitado à largura da tela', () => {
    expect(ruleFor('action-menu')).toMatch(/width:\s*216px;/);
    expect(ruleFor('action-menu')).toMatch(/max-width:\s*calc\(100vw - 32px\);/);
    expect(ruleFor('action-menu')).toMatch(/box-shadow:\s*var\(--shadow-pop\);/);
  });

  it('skeleton: sem animação com prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*\.skeleton\s*{[^}]*animation:\s*none;/,
    );
  });
});

describe('--color-accent-border (paper-spec §2)', () => {
  it('tema claro e escuro, com os valores fechados', () => {
    expect(tokens).toMatch(/--color-accent-border:\s*rgb\(217 119 6 \/ 40%\);/);
    expect(tokens).toMatch(/--color-accent-border:\s*rgb\(245 166 35 \/ 40%\);/);
  });
});
