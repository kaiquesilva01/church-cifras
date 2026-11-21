import { describe, expect, it } from 'vitest';
import { device, fakeDeps, sentTokens } from './fakeDeps';
import { registerDevice, sendTestPush, unregisterDevice } from './devices';
import { deviceId } from './token';

describe('registerDevice', () => {
  it('denies viewer and anonymous', async () => {
    const { deps } = fakeDeps({ roles: { v1: 'viewer' } });
    await expect(
      registerDevice(deps, 'v1', { token: 't', origin: 'producao' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      registerDevice(deps, undefined, { token: 't', origin: 'producao' }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it.each([
    ['origin Producao', { token: 't', origin: 'Producao' }],
    ['origin ausente', { token: 't' }],
    ['token vazio', { token: '', origin: 'producao' }],
    ['token só com espaços', { token: '   ', origin: 'producao' }],
    ['token com espaço nas pontas', { token: ' tok ', origin: 'producao' }],
    ['token acima de 4096 caracteres', { token: 'a'.repeat(4097), origin: 'producao' }],
    ['token ausente', { origin: 'producao' }],
    ['token undefined', { token: undefined, origin: 'producao' }],
    ['token número', { token: 1, origin: 'producao' }],
  ])('rejects %s with invalid-argument', async (_name, data) => {
    const { deps } = fakeDeps({ roles: { m1: 'member' } });
    await expect(registerDevice(deps, 'm1', data)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('accepts a token of exactly 4096 characters', async () => {
    const { deps } = fakeDeps({ roles: { m1: 'member' } });
    await expect(
      registerDevice(deps, 'm1', { token: 'a'.repeat(4096), origin: 'producao' }),
    ).resolves.toEqual({ ok: true });
  });

  it('stores the device under sha256(token) with uid, token, origin, createdAt and lastSeenAt', async () => {
    const { deps, devices } = fakeDeps({ roles: { m1: 'member' } });

    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'teste' });

    expect(devices.get(deviceId('tok-A'))).toMatchObject({
      uid: 'm1',
      token: 'tok-A',
      origin: 'teste',
    });
    expect(devices.get(deviceId('tok-A'))?.createdAt).toEqual(new Date('2026-11-21T12:00:00Z'));
    expect(devices.get(deviceId('tok-A'))?.lastSeenAt).toEqual(new Date('2026-11-21T12:00:00Z'));
  });

  it('same token twice keeps one record, keeps createdAt and updates lastSeenAt', async () => {
    const { deps, devices, clock } = fakeDeps({ roles: { m1: 'member' } });
    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'producao' });
    const createdAt = devices.get(deviceId('tok-A'))?.createdAt;

    clock.now = new Date('2026-11-21T13:00:00Z');
    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'producao' });

    expect(devices.size).toBe(1);
    expect(devices.get(deviceId('tok-A'))?.createdAt).toEqual(createdAt);
    expect(devices.get(deviceId('tok-A'))?.lastSeenAt).toEqual(new Date('2026-11-21T13:00:00Z'));
  });

  it('token previously owned by another uid moves to the new uid', async () => {
    const { deps, devices } = fakeDeps({ roles: { m1: 'member', a1: 'admin' } });
    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'producao' });

    await registerDevice(deps, 'a1', { token: 'tok-A', origin: 'producao' });

    expect(devices.size).toBe(1);
    expect(devices.get(deviceId('tok-A'))?.uid).toBe('a1');
  });

  it('token moved to another uid gets a new createdAt (first write of the new owner)', async () => {
    const { deps, devices, clock } = fakeDeps({ roles: { m1: 'member', a1: 'admin' } });
    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'producao' });

    clock.now = new Date('2026-11-21T13:00:00Z');
    await registerDevice(deps, 'a1', { token: 'tok-A', origin: 'producao' });

    expect(devices.get(deviceId('tok-A'))).toMatchObject({
      uid: 'a1',
      createdAt: new Date('2026-11-21T13:00:00Z'),
      lastSeenAt: new Date('2026-11-21T13:00:00Z'),
    });
  });
});

describe('unregisterDevice', () => {
  it.each([
    ['token ausente', {}],
    ['token undefined', { token: undefined }],
    ['token número', { token: 1 }],
    ['token vazio', { token: '' }],
    ['token com espaço nas pontas', { token: ' tok-V' }],
    ['token acima de 4096 caracteres', { token: 'a'.repeat(4097) }],
  ])('rejects %s with invalid-argument', async (_name, data) => {
    const { deps } = fakeDeps();
    await expect(unregisterDevice(deps, 'm1', data)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('deletes the caller own device, any role', async () => {
    const { deps, devices } = fakeDeps({
      roles: { v1: 'viewer' },
      devices: [device('tok-V', 'v1', 'producao')],
    });

    await expect(unregisterDevice(deps, 'v1', { token: 'tok-V' })).resolves.toEqual({ ok: true });

    expect(devices.size).toBe(0);
  });

  it('does not delete a device of another uid', async () => {
    const { deps, devices } = fakeDeps({ devices: [device('tok-X', 'm2', 'producao')] });

    await unregisterDevice(deps, 'm1', { token: 'tok-X' });

    expect(devices.size).toBe(1);
  });

  it('is idempotent when the device does not exist', async () => {
    const { deps } = fakeDeps();

    await expect(unregisterDevice(deps, 'm1', { token: 'nunca-existiu' })).resolves.toEqual({
      ok: true,
    });
  });

  it('requires login', async () => {
    const { deps } = fakeDeps();

    await expect(unregisterDevice(deps, undefined, { token: 'x' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});

describe('sendTestPush', () => {
  it('denies viewer', async () => {
    const { deps } = fakeDeps({ roles: { v1: 'viewer' }, devices: [device('t1', 'v1')] });

    await expect(sendTestPush(deps, 'v1')).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('sends only to the caller devices, ignores the disabled switch, returns counts', async () => {
    const { deps, calls } = fakeDeps({
      roles: { m1: 'member', m2: 'member' },
      devices: [
        device('t1', 'm1', 'producao'),
        device('t2', 'm1', 'teste'),
        device('t3', 'm2', 'producao'),
      ],
      config: { enabled: false },
    });

    const result = await sendTestPush(deps, 'm1');

    expect(result).toEqual({ sent: 2, failed: 0, pruned: 0 });
    expect(sentTokens(calls).sort()).toEqual(['t1', 't2']);
    expect(calls.flat().map((m) => m.message.title)).toEqual(['Aviso de teste', 'Aviso de teste']);
  });

  it('returns pruned, so "no device" (all zero) differs from "device pruned"', async () => {
    const none = fakeDeps({ roles: { m1: 'member' } });
    const pruned = fakeDeps({
      roles: { m1: 'member' },
      devices: [device('morto-1', 'm1')],
      failures: { 'morto-1': 'messaging/registration-token-not-registered' },
    });

    expect(await sendTestPush(none.deps, 'm1')).toEqual({ sent: 0, failed: 0, pruned: 0 });
    expect(await sendTestPush(pruned.deps, 'm1')).toEqual({ sent: 0, failed: 0, pruned: 1 });
    expect(pruned.devices.size).toBe(0);
  });

  it('returns only counts, never tokens', async () => {
    const { deps } = fakeDeps({
      roles: { m1: 'member' },
      devices: [device('segredo-1', 'm1')],
      failures: { 'segredo-1': 'messaging/registration-token-not-registered' },
    });

    const result = await sendTestPush(deps, 'm1');

    expect(JSON.stringify(result)).not.toContain('segredo-1');
  });
});
