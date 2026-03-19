// public/sw.js — Service Worker per notifiche push Web
self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'Jarvis', body: 'Hai una notifica' }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon    || '/icon-192.png',
      badge:   data.badge   || '/icon-192.png',
      data:    data.data    || {},
      actions: data.actions || [],
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(clients.matchAll({ type: 'window' }).then(cs => {
    const c = cs.find(c => c.url.includes(self.location.origin) && 'focus' in c)
    if (c) { c.navigate(url); return c.focus() }
    return clients.openWindow(url)
  }))
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))