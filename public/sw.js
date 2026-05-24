// Service worker mínimo: solo habilita instalación PWA.
// Sin caché offline — todas las peticiones van a la red.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
