export type MirrorDeps = {
  readRoot(setlistId: string): Promise<Record<string, unknown> | null>;
  writeTarget(setlistId: string, data: Record<string, unknown>): Promise<void>;
  deleteTarget(setlistId: string): Promise<void>;
};

export async function syncSetlistMirror(
  deps: MirrorDeps,
  setlistId: string,
): Promise<'written' | 'deleted'> {
  const root = await deps.readRoot(setlistId);
  if (root === null) {
    await deps.deleteTarget(setlistId);
    return 'deleted';
  }
  await deps.writeTarget(setlistId, root);
  return 'written';
}
