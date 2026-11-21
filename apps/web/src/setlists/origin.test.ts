import { describe, expect, it } from 'vitest';
import { originForHostname, parseOrigin } from './origin';

describe('originForHostname', () => {
  it('é teste só no host exato do site de teste', () => {
    expect(originForHostname('louvor-hajaluz-teste.web.app')).toBe('teste');
  });

  it('é producao no site de produção, no localhost e em qualquer outro host', () => {
    expect(originForHostname('louvor-hajaluz.web.app')).toBe('producao');
    expect(originForHostname('cifras-louvor-5dd50.web.app')).toBe('producao');
    expect(originForHostname('localhost')).toBe('producao');
    expect(originForHostname('louvor-hajaluz-teste.web.app.evil.test')).toBe('producao');
  });
});

describe('parseOrigin', () => {
  it('aceita só producao e teste', () => {
    expect(parseOrigin('teste')).toBe('teste');
    expect(parseOrigin('producao')).toBe('producao');
    expect(parseOrigin('outro')).toBeNull();
    expect(parseOrigin(undefined)).toBeNull();
  });
});
