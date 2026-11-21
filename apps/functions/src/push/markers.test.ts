import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarkerDeps } from './markers';

const fs = vi.hoisted(() => ({ create: vi.fn(), paths: [] as string[] }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => {
      fs.paths.push(path);
      return { create: fs.create };
    },
  }),
}));

beforeEach(() => {
  fs.create.mockReset();
  fs.paths.length = 0;
});

describe('createMarkerDeps.claimMarker', () => {
  it('cria avisosEnviados/<id> com os dados recebidos', async () => {
    fs.create.mockResolvedValue(undefined);
    const data = { setlistId: 'r1', tipo: 'novo' };

    const result = await createMarkerDeps().claimMarker('r1_novo', data);

    expect(result).toBe('created');
    expect(fs.paths).toEqual(['avisosEnviados/r1_novo']);
    expect(fs.create).toHaveBeenCalledWith(data);
  });

  it('ALREADY_EXISTS (código 6) vira exists, sem erro', async () => {
    fs.create.mockRejectedValue(Object.assign(new Error('already exists'), { code: 6 }));

    await expect(createMarkerDeps().claimMarker('r1_novo', {})).resolves.toBe('exists');
  });

  it('outro erro é relançado', async () => {
    fs.create.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 14 }));

    await expect(createMarkerDeps().claimMarker('r1_novo', {})).rejects.toThrow('unavailable');
  });
});
