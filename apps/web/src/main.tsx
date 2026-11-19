import { createRoot } from 'react-dom/client';
import {
  getSessionStorage,
  installPreloadErrorReload,
  scheduleClearReloadMarker,
} from './lib/preloadError';
import { prefetchForPath } from './lib/prefetch';
import './ui/styles.css';
import './ui/redesign.css';
import './ui/redesign-cifra.css';
import './ui/redesign-setlists.css';
import './ui/redesign-forms.css';
import './ui/redesign-states.css';
import './ui/redesign-stats.css';

const storage = getSessionStorage(window);
installPreloadErrorReload(window, storage);

prefetchForPath(window.location.pathname);

const root = createRoot(document.getElementById('root')!);

// #root already holds a static "Carregando…" (index.html), so the first paint needs no JS.
import('./bootstrap')
  .then(({ renderApp }) => {
    renderApp(root);
    scheduleClearReloadMarker(storage);
  })
  .catch((error: unknown) => {
    console.error('Falha ao iniciar o app', error);
    root.render(<p role="alert">Não foi possível carregar o app. Recarregue a página.</p>);
  });
