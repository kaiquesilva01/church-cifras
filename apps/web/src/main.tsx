import { createRoot } from 'react-dom/client';
import { installPreloadErrorReload } from './lib/preloadError';
import './ui/styles.css';

installPreloadErrorReload(window, sessionStorage);

const root = createRoot(document.getElementById('root')!);
root.render(
  <p role="status" className="status">
    Carregando…
  </p>,
);

import('./bootstrap')
  .then(({ renderApp }) => renderApp(root))
  .catch((error: unknown) => {
    console.error('Falha ao iniciar o app', error);
    root.render(<p role="alert">Não foi possível carregar o app. Recarregue a página.</p>);
  });
