import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import { App } from './App';
import { createAuthGateway } from './auth/gateway';
import { createCatalogApi } from './catalog/catalogApi';
import { readWebEnv } from './lib/env';
import { createFirebase } from './lib/firebase';
import { createPeopleApi } from './people/peopleApi';
import { createSetlistApi } from './setlists/setlistApi';
import { createStatsApi } from './stats/statsApi';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { TestBanner } from './ui/TestBanner';

// Everything that needs Firebase lives behind this module, so the first script only carries React
// and the loading screen; the Firebase chunk downloads in parallel right after it.
export function renderApp(root: Root): void {
  try {
    const env = readWebEnv(import.meta.env as Record<string, string | undefined>);
    const services = createFirebase(env);
    const gateway = createAuthGateway(services);
    const peopleApi = createPeopleApi(services);
    const statsApi = createStatsApi(services);
    const catalogApi = createCatalogApi(services);
    const setlistApi = createSetlistApi(services);
    root.render(
      <StrictMode>
        <TestBanner label={import.meta.env.VITE_TEST_BANNER} />
        <App
          gateway={gateway}
          peopleApi={peopleApi}
          statsApi={statsApi}
          catalogApi={catalogApi}
          setlistApi={setlistApi}
        />
        <UpdatePrompt />
      </StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    root.render(<p role="alert">{message}</p>);
  }
}
