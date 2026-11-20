import { describe, expect, it } from 'vitest';
import { describeTarget } from './backfillTarget';

describe('describeTarget', () => {
  it('mostra projeto, bucket e modo', () => {
    const { lines, canProceed } = describeTarget({
      projectId: 'meu-projeto',
      bucket: 'meu-projeto.appspot.com',
      dryRun: false,
      env: {},
    });
    expect(lines).toEqual([
      'projeto: meu-projeto',
      'bucket: meu-projeto.appspot.com',
      'modo: gravando',
    ]);
    expect(canProceed).toBe(true);
  });

  it('indica dry-run no modo', () => {
    const { lines } = describeTarget({ projectId: 'p', bucket: 'b', dryRun: true, env: {} });
    expect(lines).toContain('modo: dry-run');
  });

  it('só mostra os emuladores quando definidos', () => {
    const none = describeTarget({ projectId: 'p', bucket: 'b', dryRun: true, env: {} });
    expect(none.lines.join('\n')).not.toContain('EMULATOR');

    const empty = describeTarget({
      projectId: 'p',
      bucket: 'b',
      dryRun: true,
      env: { FIRESTORE_EMULATOR_HOST: '' },
    });
    expect(empty.lines.join('\n')).not.toContain('EMULATOR');

    const both = describeTarget({
      projectId: 'p',
      bucket: 'b',
      dryRun: false,
      env: {
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
      },
    });
    expect(both.lines).toContain('FIRESTORE_EMULATOR_HOST: 127.0.0.1:8080');
    expect(both.lines).toContain('FIREBASE_STORAGE_EMULATOR_HOST: 127.0.0.1:9199');

    const onlyOne = describeTarget({
      projectId: 'p',
      bucket: 'b',
      dryRun: false,
      env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
    });
    expect(onlyOne.lines).toContain('FIRESTORE_EMULATOR_HOST: 127.0.0.1:8080');
    expect(onlyOne.lines.join('\n')).not.toContain('FIREBASE_STORAGE_EMULATOR_HOST');
  });

  it('projeto não identificado: avisa e recusa gravar no modo real', () => {
    const real = describeTarget({ projectId: undefined, bucket: 'b', dryRun: false, env: {} });
    expect(real.lines[0]).toBe('projeto: (não identificado)');
    expect(real.lines.join('\n')).toContain('AVISO');
    expect(real.lines.join('\n')).toContain('GOOGLE_CLOUD_PROJECT');
    expect(real.canProceed).toBe(false);
  });

  it('projeto não identificado no dry-run: avisa mas segue', () => {
    const dry = describeTarget({ projectId: '', bucket: 'b', dryRun: true, env: {} });
    expect(dry.lines.join('\n')).toContain('AVISO');
    expect(dry.canProceed).toBe(true);
  });
});
