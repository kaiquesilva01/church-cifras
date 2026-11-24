import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const config = JSON.parse(readFileSync(resolve(root, 'firestore.indexes.json'), 'utf8'));

describe('firestore.indexes.json', () => {
  const override = (config.fieldOverrides ?? []).find(
    (o: { collectionGroup: string; fieldPath: string }) =>
      o.collectionGroup === 'setlists' && o.fieldPath === 'expiresAt',
  );

  it('enables TTL on setlists.expiresAt', () => {
    expect(override).toBeDefined();
    expect(override.ttl).toBe(true);
  });

  it('keeps the ascending collection-scope index on setlists.expiresAt', () => {
    expect(override.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION' });
  });

  describe('setlists: índices de grupo para consultas do pacote de ministérios', () => {
    const fieldOverride = (field: string) =>
      (config.fieldOverrides ?? []).find(
        (o: { collectionGroup: string; fieldPath: string }) =>
          o.collectionGroup === 'setlists' && o.fieldPath === field,
      );

    it.each(['date', 'rehearsalAt'])('setlists.%s tem índice ascendente de grupo', (field) => {
      expect(fieldOverride(field)?.indexes).toContainEqual({
        order: 'ASCENDING',
        queryScope: 'COLLECTION_GROUP',
      });
    });

    it.each(['date', 'rehearsalAt'])('setlists.%s mantém o índice de coleção', (field) => {
      expect(fieldOverride(field)?.indexes).toContainEqual({
        order: 'ASCENDING',
        queryScope: 'COLLECTION',
      });
    });
  });
});
