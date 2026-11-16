import { arrayMove } from '@dnd-kit/sortable';
import type { SetlistItem } from './types';

/**
 * Traduz um arrasto em `afterItemId` para a op `move`.
 * `undefined`: nada a mover; `null`: para o início; senão o id do item que
 * fica logo acima do movido depois do arrasto.
 */
export function afterIdForDrop(
  items: SetlistItem[],
  activeId: string,
  overId: string,
): string | null | undefined {
  const from = items.findIndex((i) => i.id === activeId);
  const to = items.findIndex((i) => i.id === overId);
  if (from < 0 || to < 0 || from === to) return undefined;
  const moved = arrayMove(items, from, to);
  return moved[to - 1]?.id ?? null;
}
