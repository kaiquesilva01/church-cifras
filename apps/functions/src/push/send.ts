import { SITE_BASE, deviceOrigin, shortHash, type Origin } from './token';
import type { DeviceRecord, PushDeps, PushMessage } from './types';

/** Limite de mensagens por chamada de sendEach. */
export const BATCH_SIZE = 500;

type SendBase = {
  title: string;
  body: string;
  link: string; // caminho do site, começando por "/"; o domínio vem da origem do aparelho
  tag: string;
  origin?: Origin; // sem valor: todas as origens
  excludeUid?: string; // deixa de fora os aparelhos deste uid
  respectSwitch: boolean; // true: config/push.enabled === false bloqueia
};

/** Aviso de repertório: só aparelhos de quem é do ministério. `ministryId` é obrigatório. */
export type RepertorioSend = SendBase & { ministryId: string; onlyUid?: undefined };
/** Aparelho único (teste de push), sem ministério. */
export type DeviceSend = SendBase & { ministryId?: undefined; onlyUid: string };
export type SendInput = RepertorioSend | DeviceSend;

export type SendOutcome = {
  sent: number;
  failed: number;
  pruned: number;
  unauthorizedRemoved: number;
  blocked: boolean;
};

// Só estes códigos indicam token morto; outros erros mantêm o aparelho.
const PRUNE_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

function matches(d: DeviceRecord, input: SendInput): boolean {
  if (input.excludeUid !== undefined && d.uid === input.excludeUid) return false;
  if (input.onlyUid !== undefined && d.uid !== input.onlyUid) return false;
  if (input.origin !== undefined && deviceOrigin(d.origin) !== input.origin) return false;
  return true;
}

export async function sendToDevices(deps: PushDeps, input: SendInput): Promise<SendOutcome> {
  // Sem ministryId, o ministério não filtra; só onlyUid restringe. Com ministryId presente, o filtro é
  // do ministério. Presente e vazio/em branco é inválido e falha fechado: nunca cai no envio por aparelho.
  const scoped = input.ministryId !== undefined;
  const ministryId = input.ministryId;
  if (scoped && (typeof ministryId !== 'string' || ministryId.trim() === '')) {
    throw new Error('push: ministryId vazio');
  }
  // Aviso sem ministério nem aparelho seria um envio a todos: recusado.
  if (!scoped && !input.onlyUid) {
    throw new Error('push: aviso sem ministério nem aparelho');
  }
  if (!input.link.startsWith('/') || input.link.startsWith('//')) {
    throw new Error('push link must be a site path');
  }

  const config = await deps.readPushConfig();
  if (input.respectSwitch && config?.enabled === false) {
    return { sent: 0, failed: 0, pruned: 0, unauthorizedRemoved: 0, blocked: true };
  }

  const selected = (await deps.listDevices()).filter((d) => matches(d, input));
  const uids = [...new Set(selected.map((d) => d.uid))];
  const ministries = await deps.getUserMinistries(uids);

  const stale: DeviceRecord[] = [];
  const senders: DeviceRecord[] = [];
  for (const d of selected) {
    const mine = ministries.get(d.uid);
    // Sem ministério nenhum: aparelho órfão, apagado. Outro ministério: não recebe, mas não é apagado.
    if (!mine || mine.size === 0) stale.push(d);
    else if (ministryId === undefined || mine.has(ministryId)) senders.push(d);
  }
  if (stale.length > 0) await deps.deleteDevices(stale.map((d) => d.id));

  const entries = senders.map((d) => {
    const message: PushMessage = {
      title: input.title,
      body: input.body,
      tag: input.tag,
      link: SITE_BASE[deviceOrigin(d.origin)] + input.link,
    };
    return { device: d, token: d.token, message };
  });

  let sent = 0;
  let failed = 0;
  const toPrune: DeviceRecord[] = [];

  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    const batch = entries.slice(start, start + BATCH_SIZE);
    const results = await deps.sendBatch(batch.map(({ token, message }) => ({ token, message })));
    results.forEach((result, i) => {
      const entry = batch[i];
      if (!entry) return;
      if (result.ok) {
        sent += 1;
      } else if (PRUNE_CODES.has(result.code)) {
        toPrune.push(entry.device);
        console.info(`push: pruned ${shortHash(entry.token)} (${result.code})`);
      } else {
        failed += 1;
      }
    });
  }

  if (toPrune.length > 0) await deps.deleteDevices(toPrune.map((d) => d.id));

  const outcome = {
    sent,
    failed,
    pruned: toPrune.length,
    unauthorizedRemoved: stale.length,
  };
  console.info('push: send', outcome);
  return { ...outcome, blocked: false };
}
