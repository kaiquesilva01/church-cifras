import { describe, expect, it, vi } from 'vitest';
import { REGISTER_MAX_AGE_MS } from './pushRecord';
import { createPushService } from './pushService';
import type { PushApi, PushMessagingPort, PushRecord, PushRecordStore } from './types';

const VAPID = 'vapid-test';

function memoryStore(
  initial: PushRecord | null = null,
): PushRecordStore & { value: PushRecord | null } {
  const store = {
    value: initial,
    read: () => store.value,
    write: (r: PushRecord) => {
      store.value = r;
    },
    clear: () => {
      store.value = null;
    },
  };
  return store;
}

function fakePort(overrides: Partial<PushMessagingPort> = {}): PushMessagingPort {
  return {
    isSupported: vi.fn(async () => true),
    permission: vi.fn(() => 'granted' as const),
    getToken: vi.fn(async () => 'tok-1'),
    deleteToken: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeApi(overrides: Partial<PushApi> = {}): PushApi {
  return {
    register: vi.fn(async () => {}),
    unregister: vi.fn(async () => {}),
    sendTest: vi.fn(async () => ({ sent: 1, failed: 0, pruned: 0 })),
    ...overrides,
  };
}

function build(
  opts: {
    port?: PushMessagingPort;
    api?: PushApi;
    store?: ReturnType<typeof memoryStore>;
    ios?: boolean;
    hostname?: string;
    now?: number;
  } = {},
) {
  const port = opts.port ?? fakePort();
  const api = opts.api ?? fakeApi();
  const store = opts.store ?? memoryStore();
  const svc = createPushService({
    vapidKey: VAPID,
    port,
    api,
    store,
    hostname: opts.hostname ?? 'louvor-hajaluz.web.app',
    ios: opts.ios ?? false,
    now: () => opts.now ?? 1_000,
    warn: () => {},
    releaseTimeoutMs: 50,
  });
  return { svc, port, api, store };
}

const RECORD: PushRecord = { token: 'tok-old', registeredAt: 1_000 };

describe('pushService.load', () => {
  it("permission 'default' sem registro → 'available'", async () => {
    const { svc } = build({ port: fakePort({ permission: vi.fn(() => 'default' as const) }) });
    expect(await svc.load()).toBe('available');
  });

  it("permission 'granted' com registro → 'active'", async () => {
    const { svc } = build({ store: memoryStore(RECORD) });
    expect(await svc.load()).toBe('active');
  });

  it("permission 'granted' sem registro → 'available' e não regrava (sem auto-cadastro)", async () => {
    const { svc, api, port, store } = build();
    expect(await svc.load()).toBe('available');
    expect(api.register).not.toHaveBeenCalled();
    expect(port.getToken).not.toHaveBeenCalled();
    expect(store.value).toBeNull();
  });

  it("permission 'denied' com registro → 'blocked', remove o aparelho e limpa o registro", async () => {
    const port = fakePort({ permission: vi.fn(() => 'denied' as const) });
    const { svc, api, store } = build({ port, store: memoryStore(RECORD) });
    expect(await svc.load()).toBe('blocked');
    expect(api.unregister).toHaveBeenCalledWith('tok-old');
    expect(port.deleteToken).toHaveBeenCalledTimes(1);
    expect(store.value).toBeNull();
  });

  it("permission 'default' com registro (reset da permissão) → trata como revogada", async () => {
    const port = fakePort({ permission: vi.fn(() => 'default' as const) });
    const { svc, api, store } = build({ port, store: memoryStore(RECORD) });
    expect(await svc.load()).toBe('available');
    expect(api.unregister).toHaveBeenCalledWith('tok-old');
    expect(port.deleteToken).toHaveBeenCalledTimes(1);
    expect(store.value).toBeNull();
  });

  it("ios: true → 'ios-install' e não chama isSupported", async () => {
    const { svc, port } = build({ ios: true });
    expect(await svc.load()).toBe('ios-install');
    expect(port.isSupported).not.toHaveBeenCalled();
  });

  it("isSupported resolve false → 'unsupported'", async () => {
    const { svc } = build({ port: fakePort({ isSupported: vi.fn(async () => false) }) });
    expect(await svc.load()).toBe('unsupported');
  });

  it("isSupported rejeita (carga do SDK falhou) → 'error', nunca 'unsupported'", async () => {
    const { svc } = build({
      port: fakePort({ isSupported: vi.fn(() => Promise.reject(new TypeError('chunk'))) }),
    });
    expect(await svc.load()).toBe('error');
  });
});

describe('pushService.enable', () => {
  it('chama getToken de forma síncrona, antes de qualquer await', async () => {
    const { svc, port } = build();
    const p = svc.enable();
    expect(port.getToken).toHaveBeenCalledTimes(1);
    await p;
  });

  it('sucesso em site de produção → registra com origem producao e grava o registro', async () => {
    const { svc, api, store } = build();
    expect(await svc.enable()).toBe('active');
    expect(api.register).toHaveBeenCalledWith('tok-1', 'producao');
    expect(store.value).toEqual({ token: 'tok-1', registeredAt: 1000 });
  });

  it('token novo com registro de outro token → register, unregister do antigo e grava o novo', async () => {
    const { svc, api, store } = build({ store: memoryStore(RECORD) });
    expect(await svc.enable()).toBe('active');
    expect(api.register).toHaveBeenCalledWith('tok-1', 'producao');
    expect(api.unregister).toHaveBeenCalledWith('tok-old');
    expect(store.value).toEqual({ token: 'tok-1', registeredAt: 1000 });
  });

  it('unregister do antigo nunca resolve → enable não espera e resolve active', async () => {
    const api = fakeApi({ unregister: vi.fn(() => new Promise<void>(() => {})) });
    const { svc, store } = build({ api, store: memoryStore(RECORD) });
    const result = await Promise.race([
      svc.enable(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 20)),
    ]);
    expect(result).toBe('active');
    expect(api.unregister).toHaveBeenCalledWith('tok-old');
    expect(store.value).toEqual({ token: 'tok-1', registeredAt: 1000 });
  });

  it('mesmo token do registro → não chama unregister', async () => {
    const port = fakePort({ getToken: vi.fn(async () => 'tok-old') });
    const { svc, api } = build({ port, store: memoryStore(RECORD) });
    expect(await svc.enable()).toBe('active');
    expect(api.unregister).not.toHaveBeenCalled();
  });

  it('unregister do antigo rejeita → enable continua como active', async () => {
    const api = fakeApi({ unregister: vi.fn(() => Promise.reject(new Error('offline'))) });
    const { svc, store } = build({ api, store: memoryStore(RECORD) });
    expect(await svc.enable()).toBe('active');
    expect(store.value).toEqual({ token: 'tok-1', registeredAt: 1000 });
  });

  it('sucesso no site de teste → registra com origem teste', async () => {
    const { svc, api, store } = build({ hostname: 'louvor-hajaluz-teste.web.app' });
    expect(await svc.enable()).toBe('active');
    expect(api.register).toHaveBeenCalledWith('tok-1', 'teste');
    expect(store.value).toEqual({ token: 'tok-1', registeredAt: 1000 });
  });

  it("permission-blocked e permissão ainda 'default' (dispensou) → 'available', nada gravado", async () => {
    const port = fakePort({
      getToken: vi.fn(() => Promise.reject({ code: 'messaging/permission-blocked' })),
      permission: vi.fn(() => 'default' as const),
    });
    const { svc, api, store } = build({ port });
    expect(await svc.enable()).toBe('available');
    expect(api.register).not.toHaveBeenCalled();
    expect(store.value).toBeNull();
  });

  it("permission-blocked e permissão 'denied' → 'blocked', nada gravado", async () => {
    const port = fakePort({
      getToken: vi.fn(() => Promise.reject({ code: 'messaging/permission-blocked' })),
      permission: vi.fn(() => 'denied' as const),
    });
    const { svc, api, store } = build({ port });
    expect(await svc.enable()).toBe('blocked');
    expect(api.register).not.toHaveBeenCalled();
    expect(store.value).toBeNull();
  });

  it('getToken com erro genérico (carga) → error, sem gravar', async () => {
    const port = fakePort({ getToken: vi.fn(() => Promise.reject(new TypeError('carga'))) });
    const { svc, api, store } = build({ port });
    expect(await svc.enable()).toBe('error');
    expect(api.register).not.toHaveBeenCalled();
    expect(store.value).toBeNull();
  });

  it('api.register rejeita → error, sem gravar', async () => {
    const api = fakeApi({ register: vi.fn(() => Promise.reject(new Error('rede'))) });
    const { svc, store } = build({ api });
    expect(await svc.enable()).toBe('error');
    expect(store.value).toBeNull();
  });

  it('isSupported rejeita depois do dispensado → error, não lança', async () => {
    const port = fakePort({
      getToken: vi.fn(() => Promise.reject({ code: 'messaging/permission-blocked' })),
      permission: vi.fn(() => 'default' as const),
      isSupported: vi.fn(() => Promise.reject(new TypeError('chunk'))),
    });
    const { svc } = build({ port });
    await expect(svc.enable()).resolves.toBe('error');
  });
});

describe('pushService.disable', () => {
  it('com registro: remove no servidor com o token, apaga o local, limpa e volta a available', async () => {
    const { svc, api, port, store } = build({ store: memoryStore(RECORD) });
    expect(await svc.disable()).toBe('available');
    expect(api.unregister).toHaveBeenCalledWith('tok-old');
    expect(port.deleteToken).toHaveBeenCalledTimes(1);
    expect(store.value).toBeNull();
  });

  it('unregister rejeita → mesmo assim limpa e retorna available', async () => {
    const api = fakeApi({ unregister: vi.fn(() => Promise.reject(new Error('offline'))) });
    const { svc, store } = build({ api, store: memoryStore(RECORD) });
    expect(await svc.disable()).toBe('available');
    expect(store.value).toBeNull();
  });

  it('unregister nunca resolve → retorna depois de releaseTimeoutMs', async () => {
    const api = fakeApi({ unregister: vi.fn(() => new Promise<void>(() => {})) });
    const { svc, store } = build({ api, store: memoryStore(RECORD) });
    expect(await svc.disable()).toBe('available');
    expect(store.value).toBeNull();
  });

  it('deleteToken rejeita → ainda chama unregister, limpa e retorna sem lançar', async () => {
    const port = fakePort({ deleteToken: vi.fn(() => Promise.reject(new TypeError('chunk'))) });
    const { svc, api, store } = build({ port, store: memoryStore(RECORD) });
    expect(await svc.disable()).toBe('available');
    expect(api.unregister).toHaveBeenCalledWith('tok-old');
    expect(store.value).toBeNull();
  });
});

describe('pushService.forgetDevice', () => {
  it('sem registro: nenhuma chamada à API nem ao SDK', async () => {
    const { svc, api, port } = build();
    await svc.forgetDevice();
    expect(api.unregister).not.toHaveBeenCalled();
    expect(port.deleteToken).not.toHaveBeenCalled();
  });

  it('com registro e unregister rejeitando: não lança e limpa o registro', async () => {
    const api = fakeApi({ unregister: vi.fn(() => Promise.reject(new Error('x'))) });
    const { svc, store } = build({ api, store: memoryStore(RECORD) });
    await expect(svc.forgetDevice()).resolves.toBeUndefined();
    expect(store.value).toBeNull();
  });

  it('deleteToken rejeita (SDK não carregou): ainda chama unregister e limpa o registro', async () => {
    const port = fakePort({ deleteToken: vi.fn(() => Promise.reject(new TypeError('chunk'))) });
    const { svc, api, store } = build({ port, store: memoryStore(RECORD) });
    await expect(svc.forgetDevice()).resolves.toBeUndefined();
    expect(api.unregister).toHaveBeenCalledWith('tok-old');
    expect(store.value).toBeNull();
  });

  it('unregister nunca resolve → forgetDevice resolve no teto e limpa o registro', async () => {
    const api = fakeApi({ unregister: vi.fn(() => new Promise<void>(() => {})) });
    const { svc, store } = build({ api, store: memoryStore(RECORD) });
    await expect(svc.forgetDevice()).resolves.toBeUndefined();
    expect(store.value).toBeNull();
  });
});

describe('pushService.sendTest', () => {
  it('sent > 0 → sent', async () => {
    const { svc } = build();
    expect(await svc.sendTest()).toBe('sent');
  });

  it('failed > 0 sem pruned → failed, mantém o registro', async () => {
    const api = fakeApi({ sendTest: vi.fn(async () => ({ sent: 0, failed: 1, pruned: 0 })) });
    const { svc, store } = build({ api, store: memoryStore(RECORD) });
    expect(await svc.sendTest()).toBe('failed');
    expect(store.value).toEqual(RECORD);
  });

  it('pruned > 0 → failed, limpa o registro e apaga o token local', async () => {
    const api = fakeApi({ sendTest: vi.fn(async () => ({ sent: 0, failed: 0, pruned: 1 })) });
    const { svc, port, store } = build({ api, store: memoryStore(RECORD) });
    expect(await svc.sendTest()).toBe('failed');
    expect(port.deleteToken).toHaveBeenCalledTimes(1);
    expect(store.value).toBeNull();
  });

  it('rejeição → failed', async () => {
    const api = fakeApi({ sendTest: vi.fn(() => Promise.reject(new Error('x'))) });
    const { svc } = build({ api });
    expect(await svc.sendTest()).toBe('failed');
  });

  it('pruned > 0 com failed > 0 (sent 0) → failed, mantém o registro e não apaga o token', async () => {
    const api = fakeApi({ sendTest: vi.fn(async () => ({ sent: 0, failed: 1, pruned: 1 })) });
    const { svc, port, store } = build({ api, store: memoryStore(RECORD) });
    expect(await svc.sendTest()).toBe('failed');
    expect(port.deleteToken).not.toHaveBeenCalled();
    expect(store.value).toEqual(RECORD);
  });
});

describe('pushService.revalidate', () => {
  it('sem registro não chama getToken', async () => {
    const { svc, port } = build();
    await svc.revalidate();
    expect(port.getToken).not.toHaveBeenCalled();
  });

  it("permissão 'default' não chama getToken", async () => {
    const port = fakePort({ permission: vi.fn(() => 'default' as const) });
    const { svc } = build({ port, store: memoryStore(RECORD) });
    await svc.revalidate();
    expect(port.getToken).not.toHaveBeenCalled();
  });

  it('mesmo token e registro recente → não chama register', async () => {
    const port = fakePort({ getToken: vi.fn(async () => 'tok-old') });
    const { svc, api } = build({ port, store: memoryStore(RECORD), now: 1000 });
    await svc.revalidate();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('token mudou → register com o novo, unregister do antigo, registro com o novo', async () => {
    const { svc, api, store } = build({ store: memoryStore(RECORD) });
    await svc.revalidate();
    expect(api.register).toHaveBeenCalledWith('tok-1', 'producao');
    expect(api.unregister).toHaveBeenCalledWith('tok-old');
    expect(store.value).toEqual({ token: 'tok-1', registeredAt: 1000 });
  });

  it('registro vencido com mesmo token → register e registeredAt novo', async () => {
    const port = fakePort({ getToken: vi.fn(async () => 'tok-old') });
    const { svc, api, store } = build({
      port,
      store: memoryStore(RECORD),
      now: 1_000 + REGISTER_MAX_AGE_MS + 1,
    });
    await svc.revalidate();
    expect(api.register).toHaveBeenCalledWith('tok-old', 'producao');
    expect(api.unregister).not.toHaveBeenCalled();
    expect(store.value).toEqual({
      token: 'tok-old',
      registeredAt: 1_000 + REGISTER_MAX_AGE_MS + 1,
    });
  });

  it('getToken rejeita → não lança e mantém o registro', async () => {
    const port = fakePort({ getToken: vi.fn(() => Promise.reject(new Error('x'))) });
    const { svc, store } = build({ port, store: memoryStore(RECORD) });
    await expect(svc.revalidate()).resolves.toBeUndefined();
    expect(store.value).toEqual(RECORD);
  });

  it('registro apagado enquanto getToken está pendente → não registra nem grava', async () => {
    let resolveToken: (token: string) => void = () => {};
    const port = fakePort({
      getToken: vi.fn(() => new Promise<string>((resolve) => (resolveToken = resolve))),
    });
    const store = memoryStore(RECORD);
    const { svc, api } = build({ port, store });
    const pending = svc.revalidate();
    store.clear();
    resolveToken('tok-1');
    await pending;
    expect(api.register).not.toHaveBeenCalled();
    expect(api.unregister).not.toHaveBeenCalled();
    expect(store.value).toBeNull();
  });

  it('registro trocado enquanto getToken está pendente → não sobrescreve o novo', async () => {
    let resolveToken: (token: string) => void = () => {};
    const port = fakePort({
      getToken: vi.fn(() => new Promise<string>((resolve) => (resolveToken = resolve))),
    });
    const store = memoryStore(RECORD);
    const { svc, api } = build({ port, store });
    const pending = svc.revalidate();
    const other: PushRecord = { token: 'tok-outro', registeredAt: 5_000 };
    store.write(other);
    resolveToken('tok-1');
    await pending;
    expect(api.register).not.toHaveBeenCalled();
    expect(store.value).toEqual(other);
  });

  it('desativado enquanto register está pendente → desfaz o registro novo e não regrava', async () => {
    let resolveRegister: () => void = () => {};
    const api = fakeApi({
      register: vi.fn(() => new Promise<void>((resolve) => (resolveRegister = resolve))),
    });
    const store = memoryStore(RECORD);
    const { svc } = build({ api, store });
    const pending = svc.revalidate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.register).toHaveBeenCalledWith('tok-1', 'producao');
    store.clear();
    resolveRegister();
    await pending;
    expect(api.unregister).toHaveBeenCalledWith('tok-1');
    expect(store.value).toBeNull();
  });

  it('trocado por outro token enquanto register está pendente → não regrava nem remove o novo', async () => {
    let resolveRegister: () => void = () => {};
    const api = fakeApi({
      register: vi.fn(() => new Promise<void>((resolve) => (resolveRegister = resolve))),
    });
    const store = memoryStore(RECORD);
    const { svc } = build({ api, store });
    const pending = svc.revalidate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const other: PushRecord = { token: 'tok-outro', registeredAt: 5_000 };
    store.write(other);
    resolveRegister();
    await pending;
    expect(api.unregister).not.toHaveBeenCalled();
    expect(store.value).toEqual(other);
  });
});

describe('pushService.revalidate com permissão denied', () => {
  it('não chama getToken nem unregister (o token sai só em load)', async () => {
    const port = fakePort({ permission: vi.fn(() => 'denied' as const) });
    const { svc, api } = build({ port, store: memoryStore(RECORD) });
    await svc.revalidate();
    expect(port.getToken).not.toHaveBeenCalled();
    expect(api.unregister).not.toHaveBeenCalled();
  });
});
