import { beforeEach, expect, it, vi } from 'vitest';
import { syncSetlistMirror, type MirrorDeps } from './mirror';

const deps: MirrorDeps = {
  readRoot: vi.fn(),
  writeTarget: vi.fn(),
  deleteTarget: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('copia o estado atual da raiz', async () => {
  vi.mocked(deps.readRoot).mockResolvedValue({ label: 'Domingo', items: [] });
  expect(await syncSetlistMirror(deps, 's1')).toBe('written');
  expect(deps.writeTarget).toHaveBeenCalledWith('s1', { label: 'Domingo', items: [] });
});

it('copia o estado atual, não o evento (raiz editada depois)', async () => {
  vi.mocked(deps.readRoot).mockResolvedValue({ label: 'Novo' });
  await syncSetlistMirror(deps, 's1');
  await syncSetlistMirror(deps, 's1');
  expect(deps.readRoot).toHaveBeenCalledTimes(2);
  expect(deps.writeTarget).toHaveBeenNthCalledWith(2, 's1', { label: 'Novo' });
});

it('apaga o destino quando a raiz não existe', async () => {
  vi.mocked(deps.readRoot).mockResolvedValue(null);
  expect(await syncSetlistMirror(deps, 's1')).toBe('deleted');
  expect(deps.deleteTarget).toHaveBeenCalledWith('s1');
  expect(deps.writeTarget).not.toHaveBeenCalled();
});

it('MirrorDeps não tem método de escrita na raiz', () => {
  expect(Object.keys(deps).sort()).toEqual(['deleteTarget', 'readRoot', 'writeTarget']);
});
