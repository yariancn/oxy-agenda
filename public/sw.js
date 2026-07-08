// Service worker mínimo: solo habilita instalación PWA.
// Sin caché offline — todas las peticiones van a la red.
const SW_VERSION = '2026-05-23-pos-sms-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
