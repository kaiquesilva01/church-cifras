import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SongsProvider } from '../catalog/SongsProvider';
import { SetlistsProvider } from '../setlists/SetlistsProvider';
import { fakeCatalogApi, sampleSongs } from '../test/fakeCatalogApi';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { PadPage } from './PadPage';
import { PadContext, type PadContextValue } from './usePad';

function fake(over: Partial<PadContextValue> = {}): PadContextValue {
  return {
    status: 'off',
    note: null,
    owner: null,
    volume: 0.6,
    notice: null,
    toggle: vi.fn(),
    follow: vi.fn(),
    setVolume: vi.fn(),
    prefetch: vi.fn(),
    ...over,
  };
}

function renderPage(pad: PadContextValue | null) {
  const setlistApi = fakeSetlistApi([
    makeSetlist({
      id: 'r1',
      label: 'Domingo',
      date: '2026-11-22',
      items: [
        { id: 'i1', songId: 's1', key: 'D' },
        { id: 'i2', songId: 's3', key: 'Bb' },
        { id: 'i3', songId: 's1', key: 'G' },
      ],
    }),
  ]);
  return render(
    <MemoryRouter>
      <SongsProvider api={fakeCatalogApi(sampleSongs)}>
        <SetlistsProvider api={setlistApi}>
          <PadContext.Provider value={pad}>
            <PadPage />
          </PadContext.Provider>
        </SetlistsProvider>
      </SongsProvider>
    </MemoryRouter>,
  );
}

describe('PadPage', () => {
  it('says the pad is off and points to the cifra, with the saved volume', () => {
    renderPage(fake());
    expect(screen.getByRole('heading', { level: 1, name: 'Pad' })).toBeInTheDocument();
    expect(screen.getByText('Pad desligado')).toBeInTheDocument();
    expect(screen.getByText(/Abra uma cifra e toque em/)).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Parar pad' })).not.toBeInTheDocument();
  });

  it('shows the note, the song and a stop button while it plays a cifra', () => {
    const toggle = vi.fn();
    const owner = { kind: 'song', songId: 's1' } as const;
    renderPage(fake({ status: 'playing', note: 'G', owner, toggle }));
    expect(screen.getByText('Tocando · seguindo a cifra')).toBeInTheDocument();
    expect(screen.getByLabelText('Nota G')).toHaveTextContent('G');
    expect(screen.getByText('Sonda-me · Aline Barros')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Parar pad' }));
    expect(toggle).toHaveBeenCalledWith('G', owner);
  });

  it('shows the setlist and its key sequence, highlighting the current note', async () => {
    const owner = { kind: 'setlist', setlistId: 'r1' } as const;
    renderPage(fake({ status: 'playing', note: 'A#', owner }));
    expect(await screen.findByText(/Domingo · /)).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['D', 'A#', 'G']);
    expect(screen.getByText('A#', { selector: 'li' })).toHaveClass('is-current');
  });

  it('adjusts the volume', () => {
    const setVolume = vi.fn();
    renderPage(fake({ setVolume }));
    fireEvent.change(screen.getByRole('slider', { name: 'Volume do pad' }), {
      target: { value: '30' },
    });
    expect(setVolume).toHaveBeenCalledWith(0.3);
  });

  it('shows the failure and the notice without a stop button', () => {
    renderPage(fake({ status: 'error', notice: 'Não foi possível trocar o tom do pad.' }));
    expect(screen.getByText('Pad indisponível')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível trocar o tom do pad.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Parar pad' })).not.toBeInTheDocument();
  });

  it('renders without a pad provider', () => {
    renderPage(null);
    expect(screen.getByText('Pad desligado')).toBeInTheDocument();
  });
});
