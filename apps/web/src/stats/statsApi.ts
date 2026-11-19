import type { FirebaseServices } from '../lib/firebase';

export interface TopSong {
  songId: string;
  title: string;
  artistName: string;
  uses: number;
}

export interface Stats {
  songCount: number;
  pdfCount: number;
  handmadeCount: number;
  generatedCount: number;
  storageBytes: number;
  topAllTime: TopSong[];
  topLast30Days: TopSong[];
}

export interface StatsApi {
  getStats(): Promise<Stats>;
}

export function createStatsApi({ loadFunctions }: FirebaseServices): StatsApi {
  return {
    getStats: async () => {
      const [{ httpsCallable }, functions] = await Promise.all([
        import('firebase/functions'),
        loadFunctions(),
      ]);
      const { data } = await httpsCallable<unknown, Stats>(functions, 'getStats')();
      return data;
    },
  };
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;
const BYTE_BASE = 1024;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= BYTE_BASE && unit < BYTE_UNITS.length - 1) {
    value /= BYTE_BASE;
    unit++;
  }
  const maximumFractionDigits = unit <= 1 ? 0 : 1;
  const formatted = value.toLocaleString('pt-BR', {
    maximumFractionDigits,
    useGrouping: false,
  });
  return `${formatted} ${BYTE_UNITS[unit]}`;
}
