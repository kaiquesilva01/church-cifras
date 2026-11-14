import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders app title', async () => {
    render(<App callHealth={() => Promise.resolve({ status: 'ok' })} />);
    expect(screen.getByText('Cifras · Louvor')).toBeInTheDocument();
    await screen.findByText('Servidor: ok');
  });

  it('shows backend status from health', async () => {
    render(<App callHealth={() => Promise.resolve({ status: 'ok' })} />);
    expect(await screen.findByText('Servidor: ok')).toBeInTheDocument();
  });

  it('shows offline when health fails', async () => {
    render(<App callHealth={() => Promise.reject(new Error('down'))} />);
    expect(await screen.findByText('Servidor: indisponível')).toBeInTheDocument();
  });
});
