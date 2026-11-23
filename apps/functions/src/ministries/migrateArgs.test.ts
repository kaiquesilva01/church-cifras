import { describe, expect, it } from 'vitest';
import { parseMigrateArgs } from './migrateArgs';

describe('parseMigrateArgs', () => {
  it('sem argumentos: gravando, sem admin da app', () => {
    expect(parseMigrateArgs([])).toEqual({ dryRun: false, appAdminEmail: undefined });
  });

  it('aceita --dry-run', () => {
    expect(parseMigrateArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('aceita --app-admin e devolve o e-mail sem espaços das bordas', () => {
    expect(parseMigrateArgs(['--app-admin', '  dono@example.test  '])).toEqual({
      dryRun: false,
      appAdminEmail: 'dono@example.test',
    });
  });

  it('--app-admin em branco é erro explícito, não busca por vazio', () => {
    expect(() => parseMigrateArgs(['--app-admin', '   '])).toThrow(
      /--app-admin precisa de um e-mail/,
    );
    expect(() => parseMigrateArgs(['--app-admin', ''])).toThrow(/--app-admin precisa de um e-mail/);
  });

  it('a mensagem de erro não repete o valor informado', () => {
    try {
      parseMigrateArgs(['--app-admin', '   ']);
      throw new Error('deveria ter falhado');
    } catch (error) {
      expect((error as Error).message).not.toContain('dono@example.test');
    }
  });
});
