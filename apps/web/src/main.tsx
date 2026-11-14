import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAuthGateway } from './auth/gateway';
import { readWebEnv } from './lib/env';
import { createFirebase } from './lib/firebase';
import { createPeopleApi } from './people/peopleApi';
import './ui/styles.css';

const root = createRoot(document.getElementById('root')!);

try {
  const env = readWebEnv(import.meta.env as Record<string, string | undefined>);
  const services = createFirebase(env);
  const gateway = createAuthGateway(services);
  const peopleApi = createPeopleApi(services);
  root.render(
    <StrictMode>
      <App gateway={gateway} peopleApi={peopleApi} />
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  root.render(<p role="alert">{message}</p>);
}
