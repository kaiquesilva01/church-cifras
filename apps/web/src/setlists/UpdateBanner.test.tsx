import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner', () => {
  it('shows the default message and accepts', () => {
    const onAccept = vi.fn();
    render(<UpdateBanner onAccept={onAccept} />);
    expect(screen.getByRole('status')).toHaveTextContent('O repertório foi alterado.');
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom message', () => {
    render(<UpdateBanner message="Mudou." onAccept={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('Mudou.');
  });
});
