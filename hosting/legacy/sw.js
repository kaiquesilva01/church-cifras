// Servido só no site legado (cifras-louvor-5dd50.web.app), que redireciona para o site novo.
// Quem já visitou o endereço antigo tem o service worker do app registrado aqui: ele serviria o
// index.html em cache e o redirect nunca aconteceria. Como `/sw.js` não é redirecionado, o navegador
// busca esta versão, que se desinstala, limpa os caches e recarrega as abas abertas (já sem SW,
// a navegação segue o 301 para o endereço novo).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((client) => client.navigate(client.url)));
    })(),
  );
});
