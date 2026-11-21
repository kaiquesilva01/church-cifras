import { describe, expect, it } from 'vitest';
import { deviceId, deviceOrigin, parseOrigin, SITE_BASE, shortHash } from './token';

describe('parseOrigin', () => {
  it('accepts producao and teste', () => {
    expect(parseOrigin('producao')).toBe('producao');
    expect(parseOrigin('teste')).toBe('teste');
  });

  it.each(['Producao', 'outro', '', null, undefined, 1])('rejects %s', (value) => {
    expect(parseOrigin(value)).toBeNull();
  });
});

describe('deviceOrigin', () => {
  it('treats a missing or unknown origin as producao', () => {
    expect(deviceOrigin(undefined)).toBe('producao');
    expect(deviceOrigin('lixo')).toBe('producao');
    expect(deviceOrigin('teste')).toBe('teste');
  });
});

describe('deviceId and shortHash', () => {
  it('uses the SHA-256 hex of the token as document id', () => {
    expect(deviceId('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('keeps 8 characters for logs', () => {
    expect(shortHash('abc')).toBe('ba7816bf');
  });
});

describe('SITE_BASE', () => {
  it('maps each origin to its site', () => {
    expect(SITE_BASE.producao).toBe('https://louvor-hajaluz.web.app');
    expect(SITE_BASE.teste).toBe('https://louvor-hajaluz-teste.web.app');
  });
});
