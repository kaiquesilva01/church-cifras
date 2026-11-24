import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  announce: vi.fn(),
  opts: undefined as unknown,
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (opts: unknown, handler: unknown) => {
    h.opts = opts;
    return handler;
  },
}));
vi.mock('./announce', () => ({ announceNewSetlist: h.announce }));
vi.mock('./adminDeps', () => ({ createPushDeps: () => ({}) }));

import { onMinistrySetlistWritten } from './setlistTrigger';

type Event = {
  params: { ministryId: string; setlistId: string };
  data?: { before: { data: () => unknown }; after: { data: () => unknown } };
};
const handler = onMinistrySetlistWritten as unknown as (event: Event) => Promise<unknown>;

beforeEach(() => {
  h.announce.mockReset();
  h.announce.mockResolvedValue('not-due');
});

describe('onMinistrySetlistWritten: fiação', () => {
  it('escuta ministries/{ministryId}/setlists/{setlistId} na região de São Paulo, sem retry', () => {
    expect(h.opts).toEqual({
      document: 'ministries/{ministryId}/setlists/{setlistId}',
      region: 'southamerica-east1',
      retry: false,
    });
  });

  it('repassa o id e os dados antes e depois', async () => {
    const after = { date: '2026-11-22', items: [] };
    await handler({
      params: { ministryId: 'hajaluz', setlistId: 'r1' },
      data: { before: { data: () => undefined }, after: { data: () => after } },
    });

    expect(h.announce).toHaveBeenCalledWith(
      expect.objectContaining({ claimMarker: expect.any(Function) }),
      'r1',
      'hajaluz',
      undefined,
      after,
    );
  });

  it('sem data no evento, repassa undefined nos dois lados', async () => {
    await handler({ params: { ministryId: 'hajaluz', setlistId: 'r1' } });

    expect(h.announce).toHaveBeenCalledWith(
      expect.objectContaining({ claimMarker: expect.any(Function) }),
      'r1',
      'hajaluz',
      undefined,
      undefined,
    );
  });
});
