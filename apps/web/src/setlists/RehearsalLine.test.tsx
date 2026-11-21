import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RehearsalLine } from './RehearsalLine';
import { rehearsalInstant } from './rehearsal';

const now = new Date('2026-11-22T12:00:00Z'); // 09:00 em Brasília
const at = rehearsalInstant('2026-11-22', '18:30');

describe('RehearsalLine', () => {
  it('não renderiza nada sem hora', () => {
    const { container } = render(<RehearsalLine now={now} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o texto e, com clock, um relógio escondido de leitores de tela', () => {
    const { container } = render(<RehearsalLine rehearsalAt={at} now={now} clock />);
    expect(screen.getByText('Ensaio hoje às 18h30')).toBeInTheDocument();
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.rehearsal-line')).not.toHaveClass('is-muted');
  });

  it('fica muted depois da hora', () => {
    const { container } = render(
      <RehearsalLine rehearsalAt={at} now={new Date('2026-11-22T22:00:00Z')} clock />,
    );
    expect(container.querySelector('.rehearsal-line')).toHaveClass('is-muted');
  });

  it('fica muted quando pedido (cartão), mesmo antes da hora, e sem relógio por padrão', () => {
    const { container } = render(<RehearsalLine rehearsalAt={at} now={now} muted />);
    expect(container.querySelector('.rehearsal-line')).toHaveClass('is-muted');
    expect(container.querySelector('svg')).toBeNull();
  });
});
