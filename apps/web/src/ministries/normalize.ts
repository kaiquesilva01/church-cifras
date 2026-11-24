/** Mesma regra de `functions/src/ministries/model.ts` (copiada, não importada entre pacotes). */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
