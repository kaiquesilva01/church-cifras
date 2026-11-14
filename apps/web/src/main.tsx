import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAuthGateway } from './auth/gateway';
import { readWebEnv } from './lib/env';
import { createFirebase } from './lib/firebase';
import './ui/styles.css';

const root = createRoot(document.getElementById('root')!);

try {
  const env = readWebEnv(import.meta.env as Record<string, string | undefined>);
  const gateway = createAuthGateway(createFirebase(env));
  root.render(
    <StrictMode>
      <App gateway={gateway} />
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  root.render(<p role="alert">{message}</p>);
}
