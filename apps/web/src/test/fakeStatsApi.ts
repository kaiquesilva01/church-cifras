import { vi } from 'vitest';
import type { Stats, StatsApi } from '../stats/statsApi';

export function fakeStatsApi(overrides: Partial<Stats> = {}): StatsApi {
  const stats: Stats = {
    songCount: 120,
    pdfCount: 35,
    handmadeCount: 12,
    generatedCount: 23,
    storageBytes: 65430938,
    topAllTime: [
      { songId: 's1', title: 'Sonda-me', artistName: 'Aline Barros', uses: 14 },
      { songId: 's2', title: 'Grande é o Senhor', artistName: 'Adhemar de Campos', uses: 9 },
    ],
    topLast30Days: [
      { songId: 's2', title: 'Grande é o Senhor', artistName: 'Adhemar de Campos', uses: 4 },
    ],
    ...overrides,
  };
  return {
    getStats: vi.fn(() => Promise.resolve(stats)),
  };
}
