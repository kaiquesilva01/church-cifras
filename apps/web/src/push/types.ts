import { createContext } from 'react';
import type { SetlistOrigin } from '../setlists/types';

/** Estado da linha "Avisos" na aba Mais. */
export type AvisosStatus =
  | 'checking'
  | 'available'
  | 'enabling'
  | 'active'
  | 'disabling'
  | 'blocked'
  | 'ios-install'
  | 'unsupported'
  | 'error';

/** Resultado do "Enviar aviso de teste". */
export type TestStatus = 'idle' | 'sending' | 'sent' | 'failed';

/** Aparelho gravado neste navegador: o token que o servidor conhece. */
export interface PushRecord {
  token: string;
  /** Quando foi gravado no servidor (ms desde a época). */
  registeredAt: number;
}

export interface PushRecordStore {
  read(): PushRecord | null;
  write(record: PushRecord): void;
  clear(): void;
}

/** Porta sobre `firebase/messaging`. A implementação real está em `messaging.ts`. */
export interface PushMessagingPort {
  /** Rejeita se a carga do SDK falhar (é erro, não "sem suporte"); `false` só quando o navegador não suporta. */
  isSupported(): Promise<boolean>;
  /** 'unsupported' quando a API de notificação não existe (iOS fora da tela inicial, por exemplo). */
  permission(): NotificationPermission | 'unsupported';
  /** Pede a permissão só se ainda está em 'default'; deve ser a primeira chamada do toque em Ativar. */
  getToken(vapidKey: string): Promise<string>;
  deleteToken(): Promise<void>;
}

/** Callables de #98. */
export interface PushApi {
  register(token: string, origin: SetlistOrigin): Promise<void>;
  unregister(token: string): Promise<void>;
  sendTest(): Promise<{ sent: number; failed: number; pruned: number }>;
}

export interface PushService {
  /** Estado inicial da linha. Com permissão revogada e aparelho gravado, remove o aparelho antes. */
  load(): Promise<AvisosStatus>;
  /** Chamado direto do toque em Ativar: a primeira ação é `port.getToken`, sem `await` antes. */
  enable(): Promise<AvisosStatus>;
  disable(): Promise<AvisosStatus>;
  sendTest(): Promise<TestStatus>;
  /** Ao abrir o app com avisos ativos. Nunca lança. */
  revalidate(): Promise<void>;
  /** Antes de sair da conta. Nunca lança e tem teto de tempo. */
  forgetDevice(): Promise<void>;
}

/** `null` quando a linha não existe (sem VAPID). Os componentes leem daqui. */
export const PushContext = createContext<PushService | null>(null);
