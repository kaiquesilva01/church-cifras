import { onSchedule } from 'firebase-functions/v2/scheduler';
import { failureCode } from './announce';
import { createReminderDeps } from './reminderDeps';
import { runRehearsalReminders } from './reminders';

const deps = createReminderDeps();

// Cron de 1 minuto. O aviso do ensaio tem janelas próprias (véspera, no dia e 1 hora), em `rehearsal.ts`; a marca impede duplicata.
// Nunca relança: a função não reexecuta o lote, e a mensagem de erro pode conter dados sensíveis.
export const sendRehearsalReminders = onSchedule(
  {
    region: 'southamerica-east1',
    schedule: '* * * * *',
    timeZone: 'America/Sao_Paulo',
    maxInstances: 1,
  },
  async () => {
    try {
      await runRehearsalReminders(deps);
    } catch (error) {
      console.error('push: falha nos lembretes do ensaio', { code: failureCode(error) });
    }
  },
);
