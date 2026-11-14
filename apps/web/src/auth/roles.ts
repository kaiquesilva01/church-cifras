export type Role = 'viewer' | 'member' | 'admin';

export const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Visitante',
  member: 'Membro',
  admin: 'Admin',
};

export const canEdit = (role: Role): boolean => role === 'member' || role === 'admin';
export const isAdmin = (role: Role): boolean => role === 'admin';
