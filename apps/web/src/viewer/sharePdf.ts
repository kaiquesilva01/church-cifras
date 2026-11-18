export type ShareResult = 'shared' | 'cancelled';

export function canSharePdf(): boolean {
  try {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      return false;
    }
    const probe = new File([], 'cifra.pdf', { type: 'application/pdf' });
    return Boolean(navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

export function pdfFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as BlobPart], name, { type: 'application/pdf' });
}

export async function sharePdf(file: File): Promise<ShareResult> {
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}
