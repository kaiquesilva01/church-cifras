import { describe, expect, it } from 'vitest';
import { requireRole } from './requireRole';

const depsWith = (role: unknown) => ({ getUserRole: async () => role });

describe('requireRole', () => {
  it('reads role from users doc', async () => {
    await expect(requireRole(depsWith('member'), 'u1', ['member', 'admin'])).resolves.toBe(
      'member',
    );
  });

  it('rejects missing uid', async () => {
    await expect(requireRole(depsWith('admin'), undefined, ['admin'])).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects role not allowed', async () => {
    await expect(requireRole(depsWith('viewer'), 'u1', ['member'])).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects unknown role value', async () => {
    await expect(requireRole(depsWith('root'), 'u1', ['admin'])).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(requireRole(depsWith(undefined), 'u1', ['admin'])).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
