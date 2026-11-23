export type Role = 'viewer' | 'member' | 'admin';

export const ROLES: readonly Role[] = ['viewer', 'member', 'admin'];

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Visitante',
  member: 'Membro',
  admin: 'Admin',
};

export const canEdit = (role: Role): boolean => role === 'member' || role === 'admin';
/** Só admin cria, edita, duplica e apaga repertórios (membro só lê). */
export const canEditSetlists = (role: Role): boolean => role === 'admin';
export const isAdmin = (role: Role): boolean => role === 'admin';
