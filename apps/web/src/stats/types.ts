import type { Stats as StatsResult, TopSong } from './statsApi';

export type { Stats as StatsResult, TopSong } from './statsApi';

export type MinistryRanking = {
  id: string;
  name: string;
  topAllTime: TopSong[];
  topLast30Days: TopSong[];
};

/** Cartões e ranking geral (só admin da app) e ranking do ministério pedido. */
export type StatsCallerResult = {
  general: StatsResult | null;
  ministry: MinistryRanking | null;
};
