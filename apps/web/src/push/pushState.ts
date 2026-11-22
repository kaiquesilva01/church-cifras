import { isIosSafari, isStandalone, readInstallEnvironment } from '../pwa/installPolicy';

export type RestAvisosStatus = 'available' | 'active' | 'blocked' | 'ios-install' | 'unsupported';

export interface AvisosInput {
  supported: boolean;
  iosNotInstalled: boolean;
  permission: NotificationPermission | 'unsupported';
  hasRecord: boolean;
}

/** Estado de repouso. Checando, ativando, desativando e erro são transitórios (hook). */
export function decideAvisos(input: AvisosInput): RestAvisosStatus {
  if (input.iosNotInstalled) return 'ios-install';
  if (!input.supported || input.permission === 'unsupported') return 'unsupported';
  if (input.permission === 'denied') return 'blocked';
  if (input.permission === 'granted' && input.hasRecord) return 'active';
  return 'available';
}

/** iPhone/iPad com Safari fora da tela inicial: não há push nem pedido de permissão. */
export function iosNotInstalled(win: Window): boolean {
  const env = readInstallEnvironment(win);
  return isIosSafari(env) && !isStandalone(env);
}
