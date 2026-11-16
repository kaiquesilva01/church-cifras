import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import { App } from './App';
import { createAuthGateway } from './auth/gateway';
import { createCatalogApi } from './catalog/catalogApi';
import { readWebEnv } from './lib/env';
import { createFirebase } from './lib/firebase';
import { createPeopleApi } from './people/peopleApi';
import { UpdatePrompt } from './pwa/UpdatePrompt';

// Everything that needs Firebase lives behind this module, so the first script only carries React
// and the loading screen; the Firebase chunk downloads in parallel right after it.
export function renderApp(root: Root): void {
  try {
    const env = readWebEnv(import.meta.env as Record<string, string | undefined>);
    const services = createFirebase(env);
    const gateway = createAuthGateway(services);
    const peopleApi = createPeopleApi(services);
    const catalogApi = createCatalogApi(services);
    root.render(
      <StrictMode>
        <App gateway={gateway} peopleApi={peopleApi} catalogApi={catalogApi} />
        <UpdatePrompt />
      </StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    root.render(<p role="alert">{message}</p>);
  }
}
