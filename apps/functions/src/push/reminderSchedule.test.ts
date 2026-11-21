import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  opts: undefined as unknown,
  run: vi.fn(),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (opts: unknown, handler: unknown) => {
    h.opts = opts;
    return handler;
  },
}));
vi.mock('./reminderDeps', () => ({ createReminderDeps: () => ({ fake: 'deps' }) }));
vi.mock('./reminders', () => ({ runRehearsalReminders: h.run }));

import { sendRehearsalReminders } from './reminderSchedule';

const handler = sendRehearsalReminders as unknown as () => Promise<void>;

beforeEach(() => {
  h.run.mockReset();
  h.run.mockResolvedValue({ sent: 0, already: 0, blocked: 0, failed: 0 });
});

describe('sendRehearsalReminders: agendamento', () => {
  it('roda a cada minuto em America/Sao_Paulo, com uma instância por vez', () => {
    expect(h.opts).toEqual({
      region: 'southamerica-east1',
      schedule: '* * * * *',
      timeZone: 'America/Sao_Paulo',
      maxInstances: 1,
    });
  });

  it('chama o lembrete com as deps reais', async () => {
    await handler();
    expect(h.run).toHaveBeenCalledWith({ fake: 'deps' });
  });
});
