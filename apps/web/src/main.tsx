import { httpsCallable } from 'firebase/functions';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createFirebase, type WebEnv } from './lib/firebase';

const { functions } = createFirebase(import.meta.env as unknown as WebEnv);
const health = httpsCallable<unknown, { status: string }>(functions, 'health');
const callHealth = async () => (await health()).data;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App callHealth={callHealth} />
  </StrictMode>,
);
