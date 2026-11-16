import type { SongSummary } from '../catalog/types';

export type UploadDecision = 'new-song' | 'add-key' | 'replace-generated' | 'blocked';

export function decideUpload(
  existing: { song: SongSummary; arrangement: { source: string } | null } | null,
): UploadDecision {
  if (!existing) return 'new-song';
  if (!existing.arrangement) return 'add-key';
  return existing.arrangement.source === 'generated' ? 'replace-generated' : 'blocked';
}
