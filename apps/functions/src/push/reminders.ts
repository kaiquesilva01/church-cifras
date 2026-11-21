import { failureCode, markerExpiresAt } from './announce';
import {
  NOW_MS,
  planRehearsalReminder,
  readRehearsalSetlist,
  SOON_MS,
  type RehearsalSetlist,
} from './rehearsal';
import type { MarkerDeps } from './markers';
import { toDate } from './newSetlist';
import { sendToDevices } from './send';
import type { PushDeps } from './types';

export type ReminderDeps = PushDeps &
  MarkerDeps & {
    listRehearsalSetlists(
      from: Date,
      to: Date,
    ): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
    listRehearsalMarkers(setlistId: string): Promise<Array<Record<string, unknown>>>;
  };

export type ReminderRun = { sent: number; already: number; blocked: number; failed: number };

// Horários dos avisos "perto" já enviados para o repertório. Marcas "agora" não entram:
// elas nunca indicam mudança de horário.
async function earlierSoonTimes(deps: ReminderDeps, setlistId: string): Promise<number[]> {
  const markers = await deps.listRehearsalMarkers(setlistId);
  const times: number[] = [];
  for (const marker of markers) {
    if (marker.tipo !== 'perto') continue;
    const at = toDate(marker.rehearsalAt);
    if (at !== undefined) times.push(at.getTime());
  }
  return times;
}

async function remind(
  deps: ReminderDeps,
  setlist: RehearsalSetlist,
  now: Date,
  run: ReminderRun,
): Promise<void> {
  const plan = planRehearsalReminder(now, setlist, await earlierSoonTimes(deps, setlist.id));
  if (plan === null) return;

  const claim = await deps.claimMarker(`${setlist.id}_${plan.tipo}_${plan.rehearsalAtMs}`, {
    setlistId: setlist.id,
    tipo: plan.tipo,
    rehearsalAt: new Date(plan.rehearsalAtMs),
    createdAt: now,
    expiresAt: markerExpiresAt(now, setlist.expiresAt),
  });
  if (claim === 'exists') {
    run.already += 1;
    return;
  }

  const outcome = await sendToDevices(deps, plan.input);
  if (outcome.blocked) {
    run.blocked += 1;
    return;
  }
  run.sent += outcome.sent;
  run.failed += outcome.failed;
}

/** Avisa o ensaio que cai na janela de 5 min antes até 30 min depois de agora. */
export async function runRehearsalReminders(deps: ReminderDeps): Promise<ReminderRun> {
  const now = deps.now();
  const run: ReminderRun = { sent: 0, already: 0, blocked: 0, failed: 0 };

  const docs = await deps.listRehearsalSetlists(
    new Date(now.getTime() - NOW_MS),
    new Date(now.getTime() + SOON_MS),
  );
  for (const doc of docs) {
    const setlist = readRehearsalSetlist(doc.id, doc.data);
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

  // Roda a cada minuto: só loga quando houve algo além de nada a fazer.
  if (run.sent + run.already + run.blocked + run.failed > 0) {
    console.info('push: lembretes do ensaio', { ...run });
  }
  return run;
}
