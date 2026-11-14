import { useEffect, useState } from 'react';

export interface AppProps {
  callHealth: () => Promise<{ status: string }>;
}

type ServerState = 'loading' | 'ok' | 'offline';

export function App({ callHealth }: AppProps) {
  const [state, setState] = useState<ServerState>('loading');

  useEffect(() => {
    let active = true;
    callHealth().then(
      (r) => active && setState(r.status === 'ok' ? 'ok' : 'offline'),
      () => active && setState('offline'),
    );
    return () => {
      active = false;
    };
  }, [callHealth]);

  const label = state === 'loading' ? 'verificando…' : state === 'ok' ? 'ok' : 'indisponível';

  return (
    <main>
      <h1>Cifras · Louvor</h1>
      <p>Servidor: {label}</p>
    </main>
  );
}
