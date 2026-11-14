import { describe, expect, it } from 'vitest';
import { makeSong } from '../test/fakeCatalogApi';
import { decideUpload } from './decideUpload';

const song = makeSong({ id: 's1' });

describe('decideUpload', () => {
  it('creates a new song when none exists', () => {
    expect(decideUpload(null)).toBe('new-song');
  });
  it('adds the key when the song exists without it', () => {
    expect(decideUpload({ song, arrangement: null })).toBe('add-key');
  });
  it('replaces a generated key', () => {
    expect(decideUpload({ song, arrangement: { source: 'generated' } })).toBe('replace-generated');
  });
  it('blocks when a handmade key exists', () => {
    expect(decideUpload({ song, arrangement: { source: 'handmade' } })).toBe('blocked');
  });
});
