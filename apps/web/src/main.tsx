import { createRoot } from 'react-dom/client';
import {
  clearReloadMarker,
  getSessionStorage,
  installPreloadErrorReload,
} from './lib/preloadError';
import './ui/styles.css';

const storage = getSessionStorage(window);
installPreloadErrorReload(window, storage);

const root = createRoot(document.getElementById('root')!);

// #root already holds a static "Carregando…" (index.html), so the first paint needs no JS.
import('./bootstrap')
  .then(({ renderApp }) => {
    renderApp(root);
    clearReloadMarker(storage);
  })
  .catch((error: unknown) => {
    console.error('Falha ao iniciar o app', error);
    root.render(<p role="alert">Não foi possível carregar o app. Recarregue a página.</p>);
  });
