import {
  closestCenter,
  type Announcements,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { afterIdForDrop } from './dnd';
import type { SetlistItem } from './types';

/** O que o item precisa para ser arrastável: ref/estilo do `li` e a alça. */
export interface RowDrag {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  handle: (title: string) => ReactNode;
}

export interface SortableItemsProps {
  items: SetlistItem[];
  editable: boolean;
  /** id do item → título, para os anúncios de leitor de tela. */
  titles?: ReadonlyMap<string, string>;
  onMove: (itemId: string, afterItemId: string | null) => void;
  renderRow: (item: SetlistItem, index: number, drag: RowDrag | undefined) => ReactNode;
}

interface DragEndLike {
  active: { id: string | number };
  over: { id: string | number } | null;
}

/** Arrasto concluído: vira `onMove(itemId, afterItemId)` quando algo mudou de lugar. */
export function handleDragEnd(
  items: SetlistItem[],
  event: DragEndLike,
  onMove: (itemId: string, afterItemId: string | null) => void,
): void {
  if (!event.over) return;
  const activeId = String(event.active.id);
  const after = afterIdForDrop(items, activeId, String(event.over.id));
  if (after !== undefined) onMove(activeId, after);
}

const ROLE_DESCRIPTION = 'item reordenável';

/** Instruções e anúncios para leitores de tela em pt-BR (o padrão do dnd-kit é inglês). */
export function ptBrAccessibility(items: SetlistItem[], titles: ReadonlyMap<string, string>) {
  const name = (id: string | number): string => titles.get(String(id)) ?? 'Música removida';
  const where = (id: string | number): string => {
    const index = items.findIndex((i) => i.id === String(id));
    return `${index + 1} de ${items.length}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou ${name(active.id)}. Posição ${where(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} movido para a posição ${where(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${name(active.id)} solto na posição ${where(over.id)}.`
        : `${name(active.id)} solto na posição original.`,
    onDragCancel: () => 'Movimento cancelado.',
  };
  return {
    announcements,
    screenReaderInstructions: {
      draggable:
        'Para pegar um item, pressione espaço. Use as setas para mover e espaço para soltar; Esc cancela.',
    },
  };
}

function SortableRow({
  item,
  index,
  renderRow,
}: {
  item: SetlistItem;
  index: number;
  renderRow: SortableItemsProps['renderRow'];
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: item.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const handle = (title: string): ReactNode => (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className="btn btn-icon setlist-item-handle"
      aria-label={`Arrastar ${title}`}
      style={{ touchAction: 'none' }}
      {...attributes}
      {...listeners}
      aria-roledescription={ROLE_DESCRIPTION}
    >
      ≡
    </button>
  );
  return <>{renderRow(item, index, { setNodeRef, style, handle })}</>;
}

export function SortableItems({ items, editable, titles, onMove, renderRow }: SortableItemsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const accessibility = useMemo(
    () => ptBrAccessibility(items, titles ?? new Map()),
    [items, titles],
  );

  if (!editable) {
    return <ul className="list">{items.map((item, i) => renderRow(item, i, undefined))}</ul>;
  }
  return (
    <DndContext
      sensors={sensors}
      accessibility={accessibility}
      collisionDetection={closestCenter}
      onDragEnd={(event) => handleDragEnd(items, event, onMove)}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="list">
          {items.map((item, i) => (
            <SortableRow key={item.id} item={item} index={i} renderRow={renderRow} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
