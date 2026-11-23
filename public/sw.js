// Needed because Android Chrome only shows notifications through a service worker.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((w) => w[0]?.focus()));
});
