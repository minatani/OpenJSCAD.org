// オフライン用のサービスワーカー：アプリのファイルを保存しておき、ネットにつながらなくても起動できるようにする
const VERSION = 'tenzoo-v0.3.0'
const FILES = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/store.js', 'js/view.js', 'js/tools.js', 'js/model.js', 'js/geometry.js', 'js/raster.js',
  'js/patterns.js', 'js/profiles.js', 'js/braille.js', 'js/a11y.js', 'js/check.js', 'js/io/esa.js', 'js/io/edl.js', 'js/io/ezi.js', 'js/io/export.js', 'js/io/import.js'
]
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
// ネットを優先し、つながらないときは保存したものを使う（更新がすぐ反映されるように）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone()
      caches.open(VERSION).then(c => c.put(e.request, copy))
      return res
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  )
})
