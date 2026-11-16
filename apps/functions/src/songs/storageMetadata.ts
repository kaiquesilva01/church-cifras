export interface MetadataFile {
  getMetadata(): Promise<[{ metadata?: Record<string, unknown> | undefined }, ...unknown[]]>;
}

// One round trip: getMetadata() directly, with a 404 meaning the object does not exist
// (the Storage SDK and the emulator both report it as `code === 404`).
export async function readUploader(
  file: MetadataFile,
): Promise<{ uploadedBy: string | undefined } | 'missing'> {
  try {
    const [metadata] = await file.getMetadata();
    const uploadedBy = metadata.metadata?.uploadedBy;
    return { uploadedBy: typeof uploadedBy === 'string' ? uploadedBy : undefined };
  } catch (error) {
    if ((error as { code?: unknown }).code === 404) return 'missing';
    throw error;
  }
}
