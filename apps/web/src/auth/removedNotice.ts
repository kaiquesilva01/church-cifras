const KEY = 'cifras:removido';

export function setRemovedNotice(ministryName: string): void {
  try {
    sessionStorage.setItem(KEY, ministryName);
  } catch {
    /* sem storage: sem aviso */
  }
}

/** Lê sem apagar: a entrada chama no primeiro render (`useState`). */
export function peekRemovedNotice(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Apaga o aviso: a entrada chama num efeito, depois de montar (seguro no StrictMode). */
export function clearRemovedNotice(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* sem storage: nada a apagar */
  }
}
