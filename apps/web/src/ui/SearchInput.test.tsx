import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput';

function Controlled({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('graus');
  return (
    <SearchInput
      aria-label="Buscar"
      placeholder="Buscar…"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('SearchInput', () => {
  it('renders a search input with its label', () => {
    render(<SearchInput aria-label="Buscar" placeholder="Buscar…" value="" onChange={vi.fn()} />);
    const input = screen.getByRole('searchbox', { name: 'Buscar' });
    expect(input).toHaveClass('search');
    expect(input).toHaveAttribute('placeholder', 'Buscar…');
  });

  it('shows the clear button only when there is text', () => {
    const { rerender } = render(
      <SearchInput aria-label="Buscar" placeholder="Buscar…" value="" onChange={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).not.toBeInTheDocument();
    rerender(
      <SearchInput aria-label="Buscar" placeholder="Buscar…" value="x" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Limpar busca' })).toHaveAttribute('type', 'button');
  });

  it('clears through onChange and gives focus back to the input', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('');
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).not.toBeInTheDocument();
  });
});
