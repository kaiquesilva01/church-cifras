import { describe, expect, it, vi } from 'vitest';
import { createPadLoader } from './padLoader';

function setup(maxBuffers?: number) {
  const bytes = new Uint8Array([1, 2, 3]);
  const fetchBytes = vi.fn().mockResolvedValue(bytes);
  const decode = vi.fn().mockImplementation(async () => ({}) as AudioBuffer);
  const loader = createPadLoader({ fetchBytes, decode, maxBuffers });
  return { bytes, fetchBytes, decode, loader };
}

describe('createPadLoader', () => {
  it('deduplica cargas simultâneas da mesma nota', async () => {
    const { loader, fetchBytes, decode } = setup();
    const [a, b] = await Promise.all([loader.load('C'), loader.load('C')]);
    expect(a).toBe(b);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(fetchBytes).toHaveBeenCalledWith('pads/v1/DS04-C.m4a');
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('reutiliza o buffer já pronto', async () => {
    const { loader, fetchBytes } = setup();
    const a = await loader.load('C');
    expect(await loader.load('C')).toBe(a);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('mantém LRU de 2 buffers', async () => {
    const { loader, fetchBytes, decode } = setup(2);
    await loader.load('C');
    await loader.load('D');
    await loader.load('E');
    expect(fetchBytes).toHaveBeenCalledTimes(3);
    await loader.load('D');
    await loader.load('E');
    expect(fetchBytes).toHaveBeenCalledTimes(3);
    await loader.load('C');
    expect(fetchBytes).toHaveBeenCalledTimes(4);
    expect(decode).toHaveBeenCalledTimes(4);
  });

  it('entrega uma cópia dos bytes ao decode', async () => {
    const { loader, decode, bytes } = setup();
    await loader.load('C');
    const received = decode.mock.calls[0]?.[0] as ArrayBuffer;
    expect(received).not.toBe(bytes.buffer);
    expect(new Uint8Array(received)).toEqual(bytes);
  });

  it('rejeita em falha e tenta de novo na chamada seguinte', async () => {
    const { loader, fetchBytes } = setup();
    fetchBytes.mockRejectedValueOnce(new Error('offline'));
    await expect(loader.load('C')).rejects.toThrow('offline');
    await expect(loader.load('C')).resolves.toBeDefined();
    expect(fetchBytes).toHaveBeenCalledTimes(2);
  });
});
