import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubShare, unstubShare } from '../test/shareStub';
import { canSharePdf, pdfFile, sharePdf } from './sharePdf';

afterEach(() => unstubShare());

describe('canSharePdf', () => {
  it('canSharePdf is false when navigator.share is missing', () => {
    expect(canSharePdf()).toBe(false);
  });

  it('canSharePdf is false when canShare rejects files', () => {
    stubShare({ share: async () => {}, canShare: () => false });
    expect(canSharePdf()).toBe(false);
  });

  it('canSharePdf is false when canShare throws', () => {
    stubShare({
      share: async () => {},
      canShare: () => {
        throw new Error('boom');
      },
    });
    expect(canSharePdf()).toBe(false);
  });

  it('canSharePdf is true when canShare accepts a pdf file', () => {
    const canShare = vi.fn(() => true);
    stubShare({ share: async () => {}, canShare });
    expect(canSharePdf()).toBe(true);
    const arg = (canShare.mock.calls[0] as unknown as [ShareData])[0];
    const file = arg.files?.[0];
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe('application/pdf');
  });
});

describe('pdfFile', () => {
  it('pdfFile builds a pdf File', () => {
    const file = pdfFile(new Uint8Array([1, 2, 3]), 'A - B (G).pdf');
    expect(file.name).toBe('A - B (G).pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(3);
  });
});

describe('sharePdf', () => {
  const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });

  it("sharePdf passes the file and resolves 'shared'", async () => {
    const share = vi.fn(async () => {});
    stubShare({ share });
    await expect(sharePdf(file)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ files: [file] });
  });

  it("sharePdf resolves 'cancelled' on AbortError", async () => {
    stubShare({
      share: async () => {
        throw new DOMException('x', 'AbortError');
      },
    });
    await expect(sharePdf(file)).resolves.toBe('cancelled');
  });

  it('sharePdf rethrows other errors', async () => {
    stubShare({
      share: async () => {
        throw new DOMException('x', 'NotAllowedError');
      },
    });
    await expect(sharePdf(file)).rejects.toMatchObject({ name: 'NotAllowedError' });
  });
});
