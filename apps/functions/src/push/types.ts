import type { GuardDeps } from '../auth/guards';

/** Mensagem com link absoluto (o domínio depende da origem do aparelho). */
export type PushMessage = { title: string; body: string; link: string; tag: string };

export type SendResult = { ok: true } | { ok: false; code: string };

export type DeviceRecord = { id: string; uid: string; token: string; origin: unknown };

export type PushDeps = GuardDeps & {
  getDeviceOwner(id: string): Promise<string | null>;
  writeDevice(id: string, data: Record<string, unknown>): Promise<void>; // merge
  deleteDevices(ids: string[]): Promise<void>;
  listDevices(): Promise<DeviceRecord[]>;
  /** uid -> ids dos ministérios do uid. Aparelho sem ministério nenhum é apagado. */
  getUserMinistries(uids: string[]): Promise<Map<string, Set<string>>>;
  // até 500 mensagens por chamada (sendEach); um resultado por mensagem, na mesma ordem
  sendBatch(messages: Array<{ token: string; message: PushMessage }>): Promise<SendResult[]>;
  readPushConfig(): Promise<{ enabled?: unknown } | null>;
  now(): Date;
};
