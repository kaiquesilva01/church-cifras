import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import { App } from './App';
import { createAuthGateway } from './auth/gateway';
import { createCatalogApi } from './catalog/catalogApi';
import { createMinistriesApi } from './ministries/ministriesApi';
import { readPushConfig, readWebEnv } from './lib/env';
import { createFirebase } from './lib/firebase';
import { createFakeMessagingPort } from './push/fakeMessaging';
import { createMessagingPort } from './push/messaging';
import { createPushApi } from './push/pushApi';
import { createPushRecordStore } from './push/pushRecord';
import { createPushService } from './push/pushService';
import { iosNotInstalled } from './push/pushState';
import { createSetlistApi } from './setlists/setlistApi';
import { createStatsApi } from './stats/statsApi';
import { localStorageOrUndefined } from './pwa/installPolicy';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { TestBanner } from './ui/TestBanner';

// Everything that needs Firebase lives behind this module, so the first script only carries React
// and the loading screen; the Firebase chunk downloads in parallel right after it.
export function renderApp(root: Root): void {
  try {
    const raw = import.meta.env as Record<string, string | undefined>;
    const env = readWebEnv(raw);
    const push = readPushConfig(raw);
    const services = createFirebase(env, { messagingSenderId: push?.messagingSenderId });
    const pushService = push
      ? createPushService({
          vapidKey: push.vapidKey,
          port:
            import.meta.env.VITE_USE_EMULATORS === 'true'
              ? createFakeMessagingPort(window)
              : createMessagingPort(services.app),
          api: createPushApi(services),
          store: createPushRecordStore(localStorageOrUndefined(window)),
          hostname: window.location.hostname,
          ios: iosNotInstalled(window),
        })
      : null;
    const gateway = createAuthGateway(services, {
      beforeSignOut: () => pushService?.forgetDevice() ?? Promise.resolve(),
    });
    const statsApi = createStatsApi(services);
    const catalogApi = createCatalogApi(services);
    // Ponte até a Tarefa 25 (MinistryScope): o ministério atual vem do provedor, não daqui.
    const setlistApi = createSetlistApi(services, { ministryId: 'hajaluz' });
    const ministriesApi = createMinistriesApi(services);
    root.render(
      <StrictMode>
        <TestBanner label={import.meta.env.VITE_TEST_BANNER} />
        <App
          gateway={gateway}
          statsApi={statsApi}
          catalogApi={catalogApi}
          setlistApi={setlistApi}
          ministriesApi={ministriesApi}
          pushService={pushService}
        />
        <UpdatePrompt />
      </StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    root.render(<p role="alert">{message}</p>);
  }
}
