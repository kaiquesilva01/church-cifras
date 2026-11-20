import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestBanner } from './TestBanner';

describe('TestBanner', () => {
  it('mostra o rótulo como status', () => {
    render(<TestBanner label="TESTE · #95" />);
    expect(screen.getByRole('status')).toHaveTextContent('TESTE · #95');
  });

  it('usa a classe test-banner (o CSS fica no redesign.css)', () => {
    render(<TestBanner label="TESTE · #95" />);
    expect(screen.getByRole('status')).toHaveClass('test-banner');
  });

  it('não renderiza nada com rótulo vazio', () => {
    render(<TestBanner label="" />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('não renderiza nada sem rótulo', () => {
    render(<TestBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
