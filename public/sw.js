// Service worker do EcoSafari — deixa o site abrir sem internet (no Pantanal
// o sinal some) e acelera visitas repetidas.
//  - Páginas: rede primeiro; sem rede, a última versão do app guardada.
//  - /assets/* (JS/CSS com hash no nome): cache primeiro, nunca muda.
//  - Fotos locais (/pousadas, /species, /icons): mostra do cache e atualiza
//    por trás.
//  - /api/*: nunca passa por aqui. Reservas e voucher são guardados pelo
//    próprio app (MinhasReservas) no cache "ecosafari-offline", só depois
//    do turista pedir — dado pessoal não fica em cache automático.
const VERSION = "v1";
const SHELL_CACHE = `ecosafari-sw-shell-${VERSION}`;
const ASSET_CACHE = `ecosafari-sw-assets-${VERSION}`;
const IMG_CACHE = `ecosafari-sw-img-${VERSION}`;
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/favicon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("ecosafari-sw-") && ![SHELL_CACHE, ASSET_CACHE, IMG_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    // /pousadas/:id e /site/:slug saem do servidor com meta tags próprias —
    // só o shell genérico do SPA vira a cópia offline.
    if (response.ok && !/^\/(site|pousadas)\//.test(new URL(request.url).pathname)) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("/index.html")) || (await caches.match("/")) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Páginas renderizadas no servidor (/pousadas/:id, /site/:slug) também
    // caem aqui: online vêm da rede como sempre.
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  if (/^\/(pousadas|species|icons)\//.test(url.pathname) || /\.(webp|png|jpe?g|svg)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMG_CACHE));
  }
});
