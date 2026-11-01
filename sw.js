// Service worker de VECI+: recibe las alertas aunque la página esté cerrada
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { titulo: 'VECI+ Alarma Comunitaria', cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.titulo || 'VECI+', {
      body: (d.cuerpo || '') + '\nToca para ver la ubicación',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'veci-' + (d.id || Date.now()),
      renotify: true,
      requireInteraction: d.tipo === 'robo',
      vibrate: d.tipo === 'robo' ? [900, 300, 900, 300, 900, 300, 900, 300, 900] : [400, 200, 400],
      data: { id: d.id },
    });
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    ventanas.forEach((c) => c.postMessage({ tipo: 'alerta', id: d.id }));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (ventanas.length) { await ventanas[0].focus(); ventanas[0].postMessage({ tipo: 'abrir', id }); }
    else await self.clients.openWindow('./?alerta=' + encodeURIComponent(id || ''));
  })());
});
