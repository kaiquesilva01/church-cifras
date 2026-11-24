import { failureCode, markerExpiresAt } from './announce';
import {
  buildRehearsalReminder,
  dueRehearsalNotice,
  lastRehearsalAt,
  LOOKAHEAD_MS,
  readRehearsalSetlist,
  type RehearsalSetlist,
} from './rehearsal';
import type { MarkerDeps } from './markers';
import { sendToDevices } from './send';
import type { PushDeps } from './types';

export type ReminderDeps = PushDeps &
  MarkerDeps & {
    listRehearsalSetlists(
      after: Date,
      until: Date,
    ): Promise<Array<{ id: string; ministryId: string; data: Record<string, unknown> }>>;
    listRehearsalMarkers(setlistId: string): Promise<Array<Record<string, unknown>>>;
  };

export type ReminderRun = { sent: number; already: number; blocked: number; failed: number };

async function remind(
  deps: ReminderDeps,
  setlist: RehearsalSetlist,
  now: Date,
  run: ReminderRun,
): Promise<void> {
  const tipo = dueRehearsalNotice(now, setlist.rehearsalAt);
  if (tipo === null) return;

  // Só com aviso devido: a leitura das marcas fica antes do claim.
  const previous = lastRehearsalAt(await deps.listRehearsalMarkers(setlist.id), now);
  const input = buildRehearsalReminder(now, setlist, tipo, previous);

  const rehearsalAtMs = setlist.rehearsalAt.getTime();
  const claim = await deps.claimMarker(`${setlist.id}_${tipo}_${rehearsalAtMs}`, {
    setlistId: setlist.id,
    tipo,
    rehearsalAt: new Date(rehearsalAtMs),
    createdAt: now,
    expiresAt: markerExpiresAt(now, setlist.expiresAt),
  });
  if (claim === 'exists') {
    run.already += 1;
    return;
  }

  const outcome = await sendToDevices(deps, input);
  if (outcome.blocked) {
    run.blocked += 1;
    return;
  }
  run.sent += outcome.sent;
  run.failed += outcome.failed;
}

/** Avisa os ensaios com horário em (agora, agora + 24 h]: véspera, no dia e 1 hora antes. */
export async function runRehearsalReminders(deps: ReminderDeps): Promise<ReminderRun> {
  const now = deps.now();
  const run: ReminderRun = { sent: 0, already: 0, blocked: 0, failed: 0 };

  const docs = await deps.listRehearsalSetlists(now, new Date(now.getTime() + LOOKAHEAD_MS));
  for (const doc of docs) {
    const setlist = readRehearsalSetlist(doc.id, doc.ministryId, doc.data);
    if (setlist === undefined) continue;
    try {
      await remind(deps, setlist, now, run);
    } catch (error) {
      run.failed += 1;
      console.error('push: falha no lembrete do ensaio', {
        setlistId: setlist.id,
        code: failureCode(error),
      });
    }
  }

  // Roda a cada minuto: só loga quando houve envio, bloqueio ou falha.
  if (run.sent + run.blocked + run.failed > 0) {
    console.info('push: lembretes do ensaio', { ...run });
  }
  return run;
}
