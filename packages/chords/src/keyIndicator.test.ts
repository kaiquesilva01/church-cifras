import { describe, expect, it } from 'vitest';
import { findKeyIndicator } from './keyIndicator';
import { line, run } from './__tests__/helpers';

describe('findKeyIndicator', () => {
  it('finds key in title parentheses', () => {
    const found = findKeyIndicator([line([run('PRA SEMPRE (Bb)', 10)])]);
    expect(found?.kind).toBe('title');
    expect(found?.key.name).toBe('Bb');
    expect(found?.token.text).toBe('(Bb)');
    expect(found?.token.x).toBeCloseTo(10 + 11 * 6);
  });

  it('finds Tom: indicator in separate run', () => {
    const found = findKeyIndicator([line([run('Tom:', 10), run('E', 40, false)])]);
    expect(found?.kind).toBe('tom');
    expect(found?.key.name).toBe('E');
    expect(found?.token.text).toBe('E');
    expect(found?.token.x).toBe(40);
  });

  it('returns null without indicator', () => {
    expect(findKeyIndicator([line([run('Am', 10), run('(A9)', 60)])])).toBeNull();
    expect(findKeyIndicator([])).toBeNull();
  });

  it('finds a standalone key run after the title', () => {
    const found = findKeyIndicator([line([run('PRA SEMPRE ', 10), run('(Bb)', 76, false)])]);
    expect(found?.kind).toBe('title');
    expect(found?.token).toMatchObject({ text: '(Bb)', x: 76 });
    expect(found?.key.name).toBe('Bb');
  });
});
