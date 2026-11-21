import type { RoleDeps } from '../auth/requireRole';
import type { Role } from '../roles';

/** Mensagem com link absoluto (o domínio depende da origem do aparelho). */
export type PushMessage = { title: string; body: string; link: string; tag: string };

export type SendResult = { ok: true } | { ok: false; code: string };

export type DeviceRecord = { id: string; uid: string; token: string; origin: unknown };

export type PushDeps = RoleDeps & {
  getDeviceOwner(id: string): Promise<string | null>;
  writeDevice(id: string, data: Record<string, unknown>): Promise<void>; // merge
  deleteDevices(ids: string[]): Promise<void>;
  listDevices(): Promise<DeviceRecord[]>;
  getUserRoles(uids: string[]): Promise<Map<string, Role>>;
  // até 500 mensagens por chamada (sendEach); um resultado por mensagem, na mesma ordem
  sendBatch(messages: Array<{ token: string; message: PushMessage }>): Promise<SendResult[]>;
  readPushConfig(): Promise<{ enabled?: unknown } | null>;
  now(): Date;
};
