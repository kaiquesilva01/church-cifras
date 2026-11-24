import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, 'redesign-ministries.css'), 'utf8');
const tokens = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8');

describe('redesign-ministries.css', () => {
  it('usa só tokens: nenhum #hex, rgb() ou hsl() solto', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });

  it('todo var(--token) usado existe em styles.css', () => {
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) expect(tokens).toContain(`${name}:`);
  });

  it('declara as classes do paper-spec §3', () => {
    for (const cls of [
      'min-tile',
      'count-badge',
      'role-badge--member',
      'role-badge--admin',
      'role-badge--app',
      'status-pill',
      'role-select',
      'person-row',
      'request-card',
      'dest-chip',
      'action-menu',
      'sheet',
      'skeleton',
      'empty-card',
      'error-box',
      'entry-card',
      'entry-row',
      'entry-footer',
      'entry-alert',
      'entry-icon',
      'entry-sent',
      'profile-card',
      'profile-avatar',
      'section-eyebrow',
      'section-title',
      'section-count',
    ]) {
      expect(css).toContain(`.${cls}`);
    }
  });

  it('count-badge: 24 px de altura e fundo âmbar', () => {
    expect(css).toMatch(/\.count-badge\s*{[^}]*height:\s*24px;/);
    expect(css).toMatch(/\.count-badge\s*{[^}]*background:\s*var\(--color-accent\);/);
  });

  it('role-select: 36 px visuais e alvo de toque de 44 px', () => {
    expect(css).toMatch(/\.role-select\s*{[^}]*height:\s*36px;/);
    expect(css).toMatch(/\.role-select::before\s*{[^}]*height:\s*44px;/);
  });

  it('action-menu: 216 px e limitado à largura da tela', () => {
    expect(css).toMatch(/\.action-menu\s*{[^}]*width:\s*216px;/);
    expect(css).toMatch(/\.action-menu\s*{[^}]*max-width:\s*calc\(100vw - 32px\);/);
    expect(css).toMatch(/\.action-menu\s*{[^}]*box-shadow:\s*var\(--shadow-pop\);/);
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
