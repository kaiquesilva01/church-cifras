import { onSchedule } from 'firebase-functions/v2/scheduler';
import { failureCode } from './announce';
import { createReminderDeps } from './reminderDeps';
import { runRehearsalReminders } from './reminders';

const deps = createReminderDeps();

// Cron de 1 minuto. A janela de 5 min para trás cobre um atraso curto do job; a marca impede duplicata.
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
