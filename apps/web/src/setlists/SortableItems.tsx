import {
  closestCenter,
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
import type { CSSProperties, ReactNode } from 'react';
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
    >
      ≡
    </button>
  );
  return <>{renderRow(item, index, { setNodeRef, style, handle })}</>;
}

export function SortableItems({ items, editable, onMove, renderRow }: SortableItemsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!editable) {
    return <ul className="list">{items.map((item, i) => renderRow(item, i, undefined))}</ul>;
  }
  return (
    <DndContext
      sensors={sensors}
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
