import { HttpsError } from 'firebase-functions/v2/https';
import type { MembershipRole } from './deps';

export const HAJALUZ_ID = 'hajaluz';
export const HAJALUZ_NAME = 'Haja Luz';
export const HAJALUZ_CITY = 'São Paulo';

export type MinistryFields = { name: string; city: string };

const MAX_TEXT = 60;
const MAX_UID = 128;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

export function slugify(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TEXT)
    .replace(/-+$/g, '');
}

export function normalizeForSearch(text: string): string {
  return stripAccents(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function invalid(message: string): HttpsError {
  return new HttpsError('invalid-argument', message);
}

function readRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) throw invalid('Dados inválidos.');
  return input as Record<string, unknown>;
}

function readText(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 1 || text.length > MAX_TEXT) {
    throw invalid(`${label} precisa ter de 1 a ${MAX_TEXT} caracteres.`);
  }
  return text;
}

export function validateMinistryFields(input: unknown): MinistryFields {
  const data = readRecord(input);
  return {
    name: readText(data.name, 'O nome do ministério'),
    city: readText(data.city, 'A cidade'),
  };
}

export function readMinistryId(data: unknown): string {
  const id = readRecord(data).ministryId;
  if (typeof id !== 'string' || id.length > MAX_TEXT || !SLUG_PATTERN.test(id)) {
    throw invalid('Identificador do ministério inválido.');
  }
  return id;
}

export function readUid(data: unknown, key = 'uid'): string {
  const uid = readRecord(data)[key];
  // '/' não cabe num id de documento: montaria caminhos como users/a/b.
  if (typeof uid !== 'string' || uid.length < 1 || uid.length > MAX_UID || uid.includes('/')) {
    throw invalid('Identificador de usuário inválido.');
  }
  return uid;
}

export function parseMembershipRole(value: unknown): MembershipRole {
  if (value === 'member' || value === 'admin') return value;
  throw invalid('Papel de membro inválido.');
}

export function requireCaller(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Entre para continuar.');
  return uid;
}

export const paths = {
  user: (uid: string) => `users/${uid}`,
  ministry: (id: string) => `ministries/${id}`,
  member: (mid: string, uid: string) => `ministries/${mid}/members/${uid}`,
  request: (mid: string, uid: string) => `ministries/${mid}/requests/${uid}`,
};
