import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceId } from './token';
import { device, fakeDeps, sentTokens } from './fakeDeps';
import { sendToDevices, type RepertorioSend, type SendInput } from './send';

const BASE = {
  title: 'Novo repertório',
  body: 'Domingo',
  link: '/repertorios/r1',
  tag: 'rep-r1',
  respectSwitch: true,
};
// Aviso de repertório do ministério hajaluz (ministryId é obrigatório nesse tipo).
const REP: SendInput = { ...BASE, ministryId: 'hajaluz' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendToDevices: quem recebe', () => {
  it('sends one message per device, with the link of each device origin', async () => {
    const { deps, calls } = fakeDeps({
      ministries: { m1: ['hajaluz'], a1: ['hajaluz'] },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'teste')],
    });

    const out = await sendToDevices(deps, REP);

    expect(out).toEqual({ sent: 2, failed: 0, pruned: 0, unauthorizedRemoved: 0, blocked: false });
    expect(calls).toEqual([
      [
        {
          token: 't1',
          message: {
            title: 'Novo repertório',
            body: 'Domingo',
            tag: 'rep-r1',
            link: 'https://louvor-hajaluz.web.app/repertorios/r1',
          },
        },
        {
          token: 't2',
          message: {
            title: 'Novo repertório',
            body: 'Domingo',
            tag: 'rep-r1',
            link: 'https://louvor-hajaluz-teste.web.app/repertorios/r1',
          },
        },
      ],
    ]);
  });

  it('treats a device without origin as producao', async () => {
    const { deps, calls } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1')],
    });

    await sendToDevices(deps, REP);

    expect(calls.flat()[0]?.message.link).toBe('https://louvor-hajaluz.web.app/repertorios/r1');
  });

  it('origin filter sends only to devices of that origin', async () => {
    const { deps, calls } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'm1', 'teste')],
    });

    const out = await sendToDevices(deps, { ...REP, origin: 'teste' });

    expect(out.sent).toBe(1);
    expect(sentTokens(calls)).toEqual(['t2']);
  });

  it('excludeUid leaves out the devices of that user', async () => {
    const { deps, calls } = fakeDeps({
      ministries: { m1: ['hajaluz'], a1: ['hajaluz'] },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'producao')],
    });

    await sendToDevices(deps, { ...REP, excludeUid: 'm1' });

    expect(sentTokens(calls)).toEqual(['t2']);
  });

  it('deletes devices of users who are no longer member or admin, and does not send to them', async () => {
    const { deps, devices, calls } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'v1', 'producao')],
    });

    const out = await sendToDevices(deps, REP);

    expect(out).toMatchObject({ sent: 1, unauthorizedRemoved: 1 });
    expect(sentTokens(calls)).toEqual(['t1']);
    expect([...devices.keys()]).toEqual([deviceId('t1')]);
  });
});

describe('sendToDevices: aparelho sem uid válido', () => {
  it('removes the device with empty uid and still sends to the valid ones', async () => {
    const { deps, devices, calls } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1', 'producao'), device('t2', '', 'producao')],
    });

    const out = await sendToDevices(deps, REP);

    expect(out).toMatchObject({ sent: 1, unauthorizedRemoved: 1 });
    expect(sentTokens(calls)).toEqual(['t1']);
    expect([...devices.keys()]).toEqual([deviceId('t1')]);
  });
});

describe('sendToDevices: lotes e poda', () => {
  it('splits devices into batches of 500 messages', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => device(`t${i}`, 'm1', 'producao'));
    const { deps, calls } = fakeDeps({ ministries: { m1: ['hajaluz'] }, devices: many });

    const out = await sendToDevices(deps, REP);

    expect(calls.map((c) => c.length)).toEqual([500, 500, 1]);
    expect(out.sent).toBe(1001);
  });

  it('prunes only not-registered and invalid-token errors, keeps the device on other errors', async () => {
    const { deps, devices } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1'), device('t2', 'm1'), device('t3', 'm1')],
      failures: {
        t1: 'messaging/registration-token-not-registered',
        t2: 'messaging/invalid-registration-token',
        t3: 'messaging/internal-error',
      },
    });

    const out = await sendToDevices(deps, REP);

    expect(out).toMatchObject({ sent: 0, failed: 1, pruned: 2 });
    expect([...devices.keys()]).toEqual([deviceId('t3')]);
  });
});

describe('sendToDevices: interruptor', () => {
  it('blocks everything when config/push is disabled and respectSwitch is true', async () => {
    const { deps, calls, devices } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1')],
      config: { enabled: false },
    });

    const out = await sendToDevices(deps, REP);

    expect(out).toEqual({ sent: 0, failed: 0, pruned: 0, unauthorizedRemoved: 0, blocked: true });
    expect(calls).toEqual([]);
    expect(devices.size).toBe(1);
  });

  it('sends when there is no config/push doc (switch on by default)', async () => {
    const { deps } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1')],
      config: null,
    });

    expect(await sendToDevices(deps, REP)).toMatchObject({ sent: 1, blocked: false });
  });

  it('ignores the disabled switch when respectSwitch is false', async () => {
    const { deps } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('t1', 'm1')],
      config: { enabled: false },
    });

    expect(await sendToDevices(deps, { ...REP, respectSwitch: false })).toMatchObject({
      sent: 1,
      blocked: false,
    });
  });
});

describe('sendToDevices: entrada e logs', () => {
  it.each(['repertorios/r1', '//evil.example/x'])('rejects link %s', async (link) => {
    const { deps } = fakeDeps({ ministries: { m1: ['hajaluz'] }, devices: [device('t1', 'm1')] });

    await expect(sendToDevices(deps, { ...REP, link })).rejects.toThrow(
      'push link must be a site path',
    );
  });

  it('logs carry counts and short hashes, never the token', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { deps } = fakeDeps({
      ministries: { m1: ['hajaluz'] },
      devices: [device('segredo-token', 'm1')],
      failures: { 'segredo-token': 'messaging/registration-token-not-registered' },
    });

    await sendToDevices(deps, REP);

    expect(info).toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain('segredo-token');
  });
});

describe('sendToDevices: aviso só para o ministério do repertório', () => {
  it('envia só aos aparelhos de quem é do ministério do repertório', async () => {
    const { deps, calls } = fakeDeps({
      devices: [device('t-a', 'ana'), device('t-b', 'bia')],
      ministries: { ana: ['hajaluz'], bia: ['outro'] },
    });

    await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz', respectSwitch: true });

    expect(sentTokens(calls)).toEqual(['t-a']);
  });

  it('não apaga aparelho de quem é de outro ministério', async () => {
    const { deps, devices } = fakeDeps({
      devices: [device('t-b', 'bia')],
      ministries: { bia: ['outro'] },
    });

    await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz', respectSwitch: true });

    expect(devices.has(deviceId('t-b'))).toBe(true);
  });

  it('apaga aparelho de quem não tem ministério nenhum', async () => {
    const { deps, devices } = fakeDeps({ devices: [device('t-x', 'saiu')], ministries: {} });

    await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz', respectSwitch: true });

    expect(devices.has(deviceId('t-x'))).toBe(false);
  });

  it('aviso sem ministryId e sem aparelho é recusado (nunca vai a todos)', async () => {
    const { deps } = fakeDeps({
      devices: [device('t-a', 'ana')],
      ministries: { ana: ['hajaluz'] },
    });

    await expect(
      sendToDevices(deps, { ...BASE, respectSwitch: true } as unknown as SendInput),
    ).rejects.toThrow('sem ministério nem aparelho');
  });

  it('teste de aparelho (onlyUid, sem ministryId) envia a quem tem ministério', async () => {
    const { deps, calls } = fakeDeps({
      devices: [device('t-b', 'bia')],
      ministries: { bia: ['outro'] },
    });

    await sendToDevices(deps, { ...BASE, onlyUid: 'bia', respectSwitch: false });

    expect(sentTokens(calls)).toEqual(['t-b']);
  });
});

describe('sendToDevices: falha ao ler vínculos', () => {
  it('nada é enviado nem apagado quando getUserMinistries falha', async () => {
    const {
      deps: base,
      devices,
      calls,
    } = fakeDeps({
      devices: [device('t-a', 'ana'), device('t-x', 'saiu')],
      ministries: { ana: ['hajaluz'] },
    });
    const deps = {
      ...base,
      getUserMinistries: async () => {
        throw new Error('firestore indisponível');
      },
    };

    await expect(sendToDevices(deps, REP)).rejects.toThrow('firestore indisponível');

    expect(calls).toEqual([]);
    expect(devices.size).toBe(2);
  });
});

describe('RepertorioSend: ministryId é obrigatório', () => {
  it('não compila sem a propriedade ministryId', () => {
    // @ts-expect-error ministryId ausente: o aviso de repertório precisa do campo
    const semCampo: RepertorioSend = {
      title: 't',
      body: 'x',
      link: '/r',
      tag: 't',
      respectSwitch: true,
    };
    void semCampo;
  });

  it('não compila sem ministério', () => {
    // O @ts-expect-error falha se o erro sumir (ex.: se alguém tornar ministryId opcional).
    const semMinisterio: RepertorioSend = {
      title: 'Novo repertório',
      body: 'x',
      link: '/repertorios/s1',
      tag: 't',
      respectSwitch: true,
      // @ts-expect-error ministryId é obrigatório no aviso de repertório: undefined não cabe em string
      ministryId: undefined,
    };
    void semMinisterio;
  });
});
