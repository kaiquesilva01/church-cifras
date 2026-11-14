import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { createFakeGateway } from './test/fakeGateway';

describe('App', () => {
  it('shows nothing but a loading state until session resolves, then login', () => {
    const gateway = createFakeGateway();
    render(<App gateway={gateway} initialPath="/" />);
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    act(() => gateway.emitUser(null));
    expect(screen.getByText('Cifras · Louvor')).toBeInTheDocument();
  });
});
