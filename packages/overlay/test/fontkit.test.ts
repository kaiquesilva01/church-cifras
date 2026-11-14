import { describe, expect, it } from 'vitest';
import { fontkit, resolveFontkit } from '../src/fontkit';

describe('fontkit shim', () => {
  it('resolves the fontkit object with create (ES builds only have a default export)', () => {
    expect(typeof fontkit.create).toBe('function');
  });

  it('resolves an ES-module-shaped namespace with only a default export', () => {
    const create = () => undefined;
    const resolved = resolveFontkit({ default: { create } } as never);
    expect(resolved.create).toBe(create);
  });

  it('resolves a CommonJS-shaped namespace', () => {
    const create = () => undefined;
    expect(resolveFontkit({ create } as never).create).toBe(create);
  });
});
