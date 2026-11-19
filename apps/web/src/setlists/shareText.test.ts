import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubShare, unstubShare } from '../test/shareStub';
import { shareText } from './shareText';

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

afterEach(() => {
  unstubShare();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe('shareText', () => {
  it('sends the text through Web Share without a separate url', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {});
    stubShare({ share });
    await expect(shareText('olá\nhttps://x/repertorios/r1')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'olá\nhttps://x/repertorios/r1' });
    const arg = share.mock.calls[0]?.[0];
    expect(arg).not.toHaveProperty('url');
  });

  it("resolves 'cancelled' silently when the person closes the share sheet", async () => {
    stubShare({
      share: async () => {
        throw new DOMException('x', 'AbortError');
      },
    });
    await expect(shareText('x')).resolves.toBe('cancelled');
  });

  it('rethrows other share errors', async () => {
    stubShare({
      share: async () => {
        throw new DOMException('x', 'NotAllowedError');
      },
    });
    await expect(shareText('x')).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it("copies the text and resolves 'copied' when Web Share is missing", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    await expect(shareText('mensagem')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('mensagem');
  });

  it('rejects when the clipboard fails', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    await expect(shareText('x')).rejects.toThrow('denied');
  });

  it('rejects when there is no clipboard either (insecure context)', async () => {
    await expect(shareText('x')).rejects.toBeInstanceOf(TypeError);
  });
});
