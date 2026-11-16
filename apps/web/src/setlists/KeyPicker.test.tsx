import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyPicker } from './KeyPicker';

describe('KeyPicker', () => {
  it('lists the saved keys, marks the current and picks one', () => {
    const onPick = vi.fn();
    render(<KeyPicker keys={['G', 'A']} current="G" onPick={onPick} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: 'G' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onPick).toHaveBeenCalledWith('A');
  });

  it('closes', () => {
    const onClose = vi.fn();
    render(<KeyPicker keys={['G']} current="G" onPick={() => undefined} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
  });
});
