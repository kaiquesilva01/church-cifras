import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useDismissable } from './useDismissable';

function Menu({ withDialog = false }: { withDialog?: boolean }) {
  const [open, setOpen] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { onBlur } = useDismissable({
    open,
    onClose: () => setOpen(false),
    root,
    trigger,
  });
  return (
    <>
      <div ref={root} onBlur={onBlur}>
        <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)}>
          Menu
        </button>
        {open && <button type="button">Item</button>}
      </div>
      <button type="button">Fora</button>
      {withDialog && (
        <div role="dialog" aria-modal="true">
          <button type="button">Dentro do diálogo</button>
        </div>
      )}
    </>
  );
}

describe('useDismissable', () => {
  it('closes on Escape and returns focus to the trigger', () => {
    render(<Menu />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Item' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus();
  });

  it('closes on pointerdown outside, without moving focus', () => {
    render(<Menu />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Fora' }));
    expect(screen.queryByRole('button', { name: 'Item' })).not.toBeInTheDocument();
  });

  it('stays open on pointerdown inside', () => {
    render(<Menu />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Item' }));
    expect(screen.getByRole('button', { name: 'Item' })).toBeInTheDocument();
  });

  it('closes when focus moves outside the container', () => {
    render(<Menu />);
    const item = screen.getByRole('button', { name: 'Item' });
    fireEvent.blur(item, { relatedTarget: screen.getByRole('button', { name: 'Fora' }) });
    expect(screen.queryByRole('button', { name: 'Item' })).not.toBeInTheDocument();
  });

  it('keeps open when focus moves inside the container', () => {
    render(<Menu />);
    const item = screen.getByRole('button', { name: 'Item' });
    fireEvent.blur(item, { relatedTarget: screen.getByRole('button', { name: 'Menu' }) });
    expect(screen.getByRole('button', { name: 'Item' })).toBeInTheDocument();
  });

  it('ignores Escape while a dialog outside the menu is open', () => {
    render(<Menu withDialog />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dentro do diálogo' }), {
      key: 'Escape',
    });
    expect(screen.getByRole('button', { name: 'Item' })).toBeInTheDocument();
  });
});
