import type { Plugin } from 'vite';

// Grava a versão do build (o SHA do commit em produção) num <meta>, para a checagem depois do deploy
// confirmar que o site novo está no ar.
export function appVersionPlugin(version: string): Plugin {
  return {
    name: 'cifras:app-version',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'app-version', content: version }, injectTo: 'head' }];
    },
  };
}
