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
});
