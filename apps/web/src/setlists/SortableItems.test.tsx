import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { handleDragEnd, ptBrAccessibility, SortableItems } from './SortableItems';
import type { SetlistItem } from './types';

const items: SetlistItem[] = [
  { id: 'a', songId: 's1', key: 'G' },
  { id: 'b', songId: 's2', key: 'D' },
  { id: 'c', songId: 's3', key: 'A' },
];

function mount(editable: boolean, onMove = vi.fn()) {
  render(
    <MemoryRouter>
      <SortableItems
        items={items}
        editable={editable}
        onMove={onMove}
        renderRow={(item, index, drag) => (
          <li key={item.id} ref={drag?.setNodeRef} style={drag?.style}>
            {item.id}
            {drag?.handle(`Música ${index}`)}
          </li>
        )}
      />
    </MemoryRouter>,
  );
}

describe('SortableItems', () => {
  it('renders a labelled handle button for editors, with touch-action only on the handle', () => {
    mount(true);
    const handle = screen.getByRole('button', { name: 'Arrastar Música 0' });
    expect(handle).toHaveTextContent('≡');
    expect(handle.style.touchAction).toBe('none');
    expect(handle).toHaveAttribute('aria-roledescription', 'item reordenável');
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('list').style.touchAction).toBe('');
  });

  it('renders no handle for visitors', () => {
    mount(false);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('handleDragEnd', () => {
  it('calls onMove with the neighbour above the drop position', () => {
    const onMove = vi.fn();
    handleDragEnd(items, { active: { id: 'a' }, over: { id: 'c' } }, onMove);
    expect(onMove).toHaveBeenCalledWith('a', 'c');
  });
  it('supports dropping at the start', () => {
    const onMove = vi.fn();
    handleDragEnd(items, { active: { id: 'c' }, over: { id: 'a' } }, onMove);
    expect(onMove).toHaveBeenCalledWith('c', null);
  });
  it('does nothing without a target or on the same item', () => {
    const onMove = vi.fn();
    handleDragEnd(items, { active: { id: 'a' }, over: null }, onMove);
    handleDragEnd(items, { active: { id: 'a' }, over: { id: 'a' } }, onMove);
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(document.body);
  });
});

describe('ptBrAccessibility', () => {
  const titles = new Map([
    ['a', 'Sonda-me'],
    ['b', 'Ressuscita-me'],
    ['c', 'Grande é o Senhor'],
  ]);
  const { announcements, screenReaderInstructions } = ptBrAccessibility(items, titles);
  const a = { id: 'a' };
  const b = { id: 'b' };

  it('gives instructions in pt-BR', () => {
    expect(screenReaderInstructions.draggable).toMatch(/espaço/);
    expect(screenReaderInstructions.draggable).toMatch(/Esc/);
  });
  it('announces with titles and positions', () => {
    expect(announcements.onDragStart!({ active: a } as never)).toBe(
      'Pegou Sonda-me. Posição 1 de 3.',
    );
    expect(announcements.onDragOver!({ active: a, over: b } as never)).toBe(
      'Sonda-me movido para a posição 2 de 3.',
    );
    expect(announcements.onDragEnd!({ active: a, over: b } as never)).toBe(
      'Sonda-me solto na posição 2 de 3.',
    );
    expect(announcements.onDragEnd!({ active: a, over: null } as never)).toBe(
      'Sonda-me solto na posição original.',
    );
    expect(announcements.onDragCancel!({ active: a, over: null } as never)).toBe(
      'Movimento cancelado.',
    );
  });
});
