import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { createFakeGateway } from './test/fakeGateway';
import type { PeopleApi } from './people/peopleApi';

const peopleApi: PeopleApi = {
  listUsers: () => Promise.resolve([]),
  setRole: () => Promise.resolve(),
};

describe('App', () => {
  it('shows nothing but a loading state until session resolves, then login', () => {
    const gateway = createFakeGateway();
    render(<App gateway={gateway} peopleApi={peopleApi} initialPath="/" />);
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    act(() => gateway.emitUser(null));
    expect(screen.getByText('Cifras · Louvor')).toBeInTheDocument();
  });
});
