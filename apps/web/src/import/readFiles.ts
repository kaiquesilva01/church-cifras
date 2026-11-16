/** Runs `task` for every item with at most `limit` in flight. */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      await task(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

export const isPdf = (file: File): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

// Subset of the (non standard) FileSystem entries API used for folder drops.
interface Entry {
  isFile: boolean;
  isDirectory: boolean;
  file?(ok: (file: File) => void, fail: (e: unknown) => void): void;
  createReader?(): {
    readEntries(ok: (entries: Entry[]) => void, fail: (e: unknown) => void): void;
  };
}

async function walk(entry: Entry, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    out.push(await new Promise<File>((ok, fail) => entry.file!(ok, fail)));
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns batches; keep reading until it returns an empty one.
    for (;;) {
      const batch = await new Promise<Entry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/** Files of a drop, descending into folders when the browser supports entries. */
export async function filesFromDrop(data: DataTransfer): Promise<File[]> {
  const items = Array.from(data.items ?? []);
  const entries = items.map(
    (item) =>
      (item as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ??
      null,
  );
  if (items.length === 0 || entries.some((entry) => entry === null)) {
    return Array.from(data.files);
  }
  const out: File[] = [];
  for (const entry of entries) await walk(entry!, out);
  return out;
}
