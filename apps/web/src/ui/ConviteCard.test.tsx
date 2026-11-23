import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConviteCard } from './ConviteCard';

describe('ConviteCard', () => {
  it('nomeia a região pelo título e mostra o apoio', () => {
    render(
      <ConviteCard
        icon={<span>ícone</span>}
        title="Ative os avisos"
        hint="Repertório novo e lembrete do ensaio"
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('region', { name: 'Ative os avisos' })).toBeInTheDocument();
    expect(screen.getByText('Repertório novo e lembrete do ensaio')).toBeInTheDocument();
  });

  it('"Agora não" chama onClose; sem ação, não há botão de ação', () => {
    const onClose = vi.fn();
    render(<ConviteCard icon={null} title="Título" hint="Apoio" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Ativar' })).not.toBeInTheDocument();
  });

  it('a ação roda ao toque e fica desabilitada quando ocupada', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <ConviteCard
        icon={null}
        title="Título"
        hint="Apoio"
        onClose={() => {}}
        action={{ label: 'Ativar', onClick }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <ConviteCard
        icon={null}
        title="Título"
        hint="Apoio"
        onClose={() => {}}
        busy
        action={{ label: 'Ativando…', disabled: true, onClick }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ativando…' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Título' })).toHaveAttribute('aria-busy', 'true');
  });
});
