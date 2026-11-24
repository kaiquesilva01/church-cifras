export type Role = 'viewer' | 'member' | 'admin';

export const ROLES: readonly Role[] = ['viewer', 'member', 'admin'];

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Visitante',
  member: 'Membro',
  admin: 'Admin',
};
