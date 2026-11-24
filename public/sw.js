// The OS push service wakes this worker even when the app and browser are closed; it shows the banner, then sleeps again.
self.addEventListener('push', (e) => {
  const { id, msg } = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification('New message', {
    body: msg ?? 'New message',
    tag: String(id), // same tag as the open page uses, so a message is never shown twice
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((w) => (w[0] ? w[0].focus() : clients.openWindow('/'))));
});
