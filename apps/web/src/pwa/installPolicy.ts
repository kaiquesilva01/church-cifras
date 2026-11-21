/** Chave versionada do convite no localStorage. Mudar o formato pede nova versão da chave. */
export const INSTALL_RECORD_KEY = 'cifras.installCard.v1';
/** "Agora não" vale por 30 dias. */
export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export type InstallCardMode = 'hidden' | 'prompt' | 'ios';

export interface InstallRecord {
  dismissedAt: number | null;
}

export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  /** `display-mode` standalone, fullscreen ou minimal-ui: o app abriu pela tela inicial. */
  displayModeStandalone: boolean;
  /** `navigator.standalone` (iOS Safari). */
  navigatorStandalone: boolean;
}

export interface InstallDecisionInput {
  iosSafari: boolean;
  standalone: boolean;
  installed: boolean;
  dismissedAt: number | null;
  now: number;
  hasPrompt: boolean;
}

const STANDALONE_MODES = ['standalone', 'fullscreen', 'minimal-ui'] as const;
const OTHER_IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo/;

export function readInstallEnvironment(win: Window): InstallEnvironment {
  // jsdom and some old browsers have no matchMedia: then the app is not installed as far as we know.
  const displayModeStandalone =
    typeof win.matchMedia === 'function' &&
    STANDALONE_MODES.some((mode) => win.matchMedia(`(display-mode: ${mode})`).matches);
  return {
    userAgent: win.navigator.userAgent,
    maxTouchPoints: win.navigator.maxTouchPoints,
    displayModeStandalone,
    navigatorStandalone:
      (win.navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

/** Safari de iPhone, iPod e iPad (o iPadOS se anuncia como Mac com toque). Outros navegadores do iOS ficam de fora. */
export function isIosSafari(
  env: Pick<InstallEnvironment, 'userAgent' | 'maxTouchPoints'>,
): boolean {
  const ua = env.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !OTHER_IOS_BROWSERS.test(ua);
}

export function isStandalone(env: InstallEnvironment): boolean {
  return env.displayModeStandalone || env.navigatorStandalone;
}

export function decideInstallCard(input: InstallDecisionInput): InstallCardMode {
  if (input.standalone || input.installed) return 'hidden';
  if (input.dismissedAt !== null) {
    const age = input.now - input.dismissedAt;
    if (age >= 0 && age < DISMISS_MS) return 'hidden';
  }
  if (input.hasPrompt) return 'prompt';
  return input.iosSafari ? 'ios' : 'hidden';
}

/** `window.localStorage` pode lançar (SecurityError em modos de privacidade). */
export function localStorageOrUndefined(win: Window): Storage | undefined {
  try {
    return win.localStorage;
  } catch {
    return undefined;
  }
}

export function readInstallRecord(storage: Pick<Storage, 'getItem'> | undefined): InstallRecord {
  try {
    const raw = storage?.getItem(INSTALL_RECORD_KEY);
    if (!raw) return { dismissedAt: null };
    const parsed: unknown = JSON.parse(raw);
    const dismissedAt = (parsed as { dismissedAt?: unknown } | null)?.dismissedAt;
    return {
      dismissedAt:
        typeof dismissedAt === 'number' && Number.isFinite(dismissedAt) ? dismissedAt : null,
    };
  } catch {
    return { dismissedAt: null };
  }
}

export function writeInstallRecord(
  storage: Pick<Storage, 'setItem'> | undefined,
  record: InstallRecord,
): void {
  try {
    storage?.setItem(INSTALL_RECORD_KEY, JSON.stringify(record));
  } catch {
    // Armazenamento bloqueado ou cheio: o "Agora não" vale só nesta sessão.
  }
}
