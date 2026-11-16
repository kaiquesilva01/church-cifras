import { MAX_ITEMS, type SetlistItem, type SetlistOp } from './types';

export class SetlistFullError extends Error {
  constructor() {
    super(`O repertório já tem ${MAX_ITEMS} músicas.`);
    this.name = 'SetlistFullError';
  }
}

interface OpResult {
  items: SetlistItem[];
  changed: boolean;
}

/** Aplica uma operação sem mutar a entrada. */
export function applySetlistOp(items: SetlistItem[], op: SetlistOp): OpResult {
  const unchanged: OpResult = { items, changed: false };
  switch (op.type) {
    case 'add': {
      if (items.some((i) => i.id === op.item.id)) return unchanged;
      if (items.length >= MAX_ITEMS) throw new SetlistFullError();
      return { items: [...items, op.item], changed: true };
    }
    case 'remove': {
      if (!items.some((i) => i.id === op.itemId)) return unchanged;
      return { items: items.filter((i) => i.id !== op.itemId), changed: true };
    }
    case 'setKey': {
      if (!items.some((i) => i.id === op.itemId)) return unchanged;
      return {
        items: items.map((i) => (i.id === op.itemId ? { ...i, key: op.key } : i)),
        changed: true,
      };
    }
    case 'move': {
      const moving = items.find((i) => i.id === op.itemId);
      if (!moving || op.afterItemId === op.itemId) return unchanged;
      const rest = items.filter((i) => i.id !== op.itemId);
      let at = 0;
      if (op.afterItemId !== null) {
        const idx = rest.findIndex((i) => i.id === op.afterItemId);
        at = idx === -1 ? rest.length : idx + 1;
      }
      const next = [...rest.slice(0, at), moving, ...rest.slice(at)];
      const changed = next.some((i, n) => i !== items[n]);
      return changed ? { items: next, changed } : unchanged;
    }
  }
}
