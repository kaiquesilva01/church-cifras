import { describe, expect, it } from 'vitest';
import { readUploader, type MetadataFile } from './storageMetadata';

const fileWith = (getMetadata: MetadataFile['getMetadata']): MetadataFile => ({ getMetadata });

describe('readUploader', () => {
  it('returns the uploadedBy custom metadata', async () => {
    const file = fileWith(async () => [{ metadata: { uploadedBy: 'u1' } }]);
    expect(await readUploader(file)).toEqual({ uploadedBy: 'u1' });
  });

  it('returns undefined uploadedBy when metadata is absent or not a string', async () => {
    expect(await readUploader(fileWith(async () => [{}]))).toEqual({ uploadedBy: undefined });
    expect(await readUploader(fileWith(async () => [{ metadata: { uploadedBy: 7 } }]))).toEqual({
      uploadedBy: undefined,
    });
  });

  it('returns missing on a 404 without a prior exists() call', async () => {
    const file = fileWith(async () => {
      throw Object.assign(new Error('No such object'), { code: 404 });
    });
    expect(await readUploader(file)).toBe('missing');
  });

  it('rethrows other errors', async () => {
    const file = fileWith(async () => {
      throw Object.assign(new Error('denied'), { code: 403 });
    });
    await expect(readUploader(file)).rejects.toThrow('denied');
  });
});
