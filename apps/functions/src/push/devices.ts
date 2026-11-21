import { HttpsError } from 'firebase-functions/v2/https';
import { requireRole } from '../auth/requireRole';
import { sendToDevices } from './send';
import { deviceId, parseOrigin } from './token';
import type { PushDeps } from './types';

const MAX_TOKEN_LENGTH = 4096;

function parseToken(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TOKEN_LENGTH ||
    value !== value.trim()
  ) {
    throw new HttpsError('invalid-argument', 'Invalid token.');
  }
  return value;
}

export async function registerDevice(
  deps: PushDeps,
  uid: string | undefined,
  data: { token?: unknown; origin?: unknown },
): Promise<{ ok: true }> {
  await requireRole(deps, uid, ['member', 'admin']);
  const owner = uid as string;

  const token = parseToken(data.token);
  const origin = parseOrigin(data.origin);
  if (origin === null) throw new HttpsError('invalid-argument', 'Invalid origin.');

  const id = deviceId(token);
  const current = await deps.getDeviceOwner(id);
  const now = deps.now();

  await deps.writeDevice(id, {
    uid: owner,
    token,
    origin,
    lastSeenAt: now,
    // Mesmo dono mantém createdAt; dono novo (ou primeira gravação) recebe um novo.
    ...(current === owner ? {} : { createdAt: now }),
  });
  return { ok: true };
}

export async function unregisterDevice(
  deps: PushDeps,
  uid: string | undefined,
  data: { token?: unknown },
): Promise<{ ok: true }> {
  if (!uid) throw new HttpsError('unauthenticated', 'Login required.');

  const token = parseToken(data.token);
  const id = deviceId(token);
  // Só apaga aparelho do próprio dono; ausente ou de outro uid é no-op (idempotente).
  if ((await deps.getDeviceOwner(id)) === uid) {
    await deps.deleteDevices([id]);
  }
  return { ok: true };
}

export async function sendTestPush(
  deps: PushDeps,
  uid: string | undefined,
): Promise<{ sent: number; failed: number }> {
  await requireRole(deps, uid, ['member', 'admin']);

  const outcome = await sendToDevices(deps, {
    title: 'Aviso de teste',
    body: 'Está tudo certo. Você vai receber os avisos do Church Cifras neste aparelho.',
    link: '/',
    tag: 'aviso-teste',
    onlyUid: uid as string,
    respectSwitch: false,
  });
  return { sent: outcome.sent, failed: outcome.failed };
}
