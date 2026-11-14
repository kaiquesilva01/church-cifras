import { describe, expect, it } from 'vitest';
import { fontkit } from '../src/fontkit';

describe('fontkit shim', () => {
  it('resolves the fontkit object with create (ES builds only have a default export)', () => {
    expect(typeof fontkit.create).toBe('function');
  });
});
