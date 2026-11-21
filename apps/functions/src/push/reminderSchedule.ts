import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createReminderDeps } from './reminderDeps';
import { runRehearsalReminders } from './reminders';

const deps = createReminderDeps();

// Cron de 1 minuto. A janela de 5 min para trás cobre um atraso curto do job; a marca impede duplicata.
export const sendRehearsalReminders = onSchedule(
  {
    region: 'southamerica-east1',
    schedule: '* * * * *',
    timeZone: 'America/Sao_Paulo',
    maxInstances: 1,
  },
  async () => {
    await runRehearsalReminders(deps);
  },
);
