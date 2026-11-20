const CACHE = 'king-music-shell-v41'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', './manifest.webmanifest', './favicon/android-chrome-192x192.png', './favicon/android-chrome-512x512.png', './favicon/favicon.ico', './favicon/favicon-32x32.png', './favicon/favicon-16x16.png', './favicon/apple-touch-icon.png'])))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('king-music-shell-') && key !== CACHE).map(key => caches.delete(key)))))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/') || event.request.headers.has('Authorization')) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./', self.registration.scope))))
  } else if (url.pathname.startsWith(new URL(self.registration.scope).pathname) && /\.(js|css|png|jpe?g|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      if (response.ok) await cache.put(event.request, response.clone())
      return response
    }))
  }
})
