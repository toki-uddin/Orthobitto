/* ============================================================
   Orthobitto — Service Worker
   Author: Omar Mohammad Chowdhury
   Strategy: Cache-First for static assets, Network-First for APIs
   ============================================================ */

'use strict';

const CACHE_NAME = 'orthobitto-v4.1.2-github-pdf-fix';
const STATIC_CACHE = 'orthobitto-static-v4.1.2-github-pdf-fix';
const DYNAMIC_CACHE = 'orthobitto-dynamic-v4.1.2-github-pdf-fix';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './dictionary-engine.js',
  './pdf-generator.js',
  './orthobitto-relations.json?v=4.1.2',
  './dictionary-inline.js?v=4.1.2',
  './orthobitto-dictionary.json?v=4.1.2',
  './content-safety.js',
  './word-classes.js',
  './manifest.json',
  './favicon.ico',
  './icon-16.png',
  './favicon-16.png',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-48.png',
  './icon-96.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

// CDN resources to cache
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&family=Hind+Siliguri:wght@300;400;500;600&family=Indie+Flower&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap',
];

// API routes to bypass cache
// APIs are sentence-translation services only. Word meanings never use them.
const API_PATTERNS = [
  /api\.mymemory\.translated\.net/,
  /libretranslate\.de/,
];

// ============================================================
// INSTALL EVENT — Cache static assets
// ============================================================
self.addEventListener('install', event => {
  console.log('[SW] Installing v4.1.2-github-pdf-fix...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Pre-caching static assets...');
        return cache.addAll(PRECACHE_ASSETS).catch(err => {
          console.warn('[SW] Some assets failed to pre-cache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE EVENT — Clean up old caches
// ============================================================
self.addEventListener('activate', event => {
  console.log('[SW] Activating v4.1.2-github-pdf-fix...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('orthobitto-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old Orthobitto cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH EVENT — Routing Strategy
// ============================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Chrome extensions
  if (url.protocol === 'chrome-extension:') return;

  // Skip API calls — network only
  if (API_PATTERNS.some(pattern => pattern.test(request.url))) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Skip Tesseract worker scripts — network first
  if (request.url.includes('tesseract')) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Google Fonts — cache first
  if (request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // CDN scripts — cache first
  if (request.url.includes('cdnjs.cloudflare.com') || request.url.includes('jsdelivr.net')) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Static app assets — cache first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Everything else — network first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ============================================================
// CACHING STRATEGIES
// ============================================================

/**
 * Cache First — Return from cache, fallback to network
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  return fetchAndCache(request, cache);
}

/**
 * Network First — Try network, fallback to cache
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetchWithTimeout(request, 8000);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineFallbackResponse(request);
  }
}

/**
 * Network Only — No caching
 */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Network unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Fetch and store in cache
 */
async function fetchAndCache(request, cache) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.status < 400) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return offlineFallbackResponse(request);
  }
}

/**
 * Background cache refresh
 */
function refreshCache(request, cache) {
  fetch(request).then(response => {
    if (response && response.ok) {
      cache.put(request, response);
    }
  }).catch(() => {});
}

/**
 * Fetch with timeout
 */
function fetchWithTimeout(request, ms) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ]);
}

/**
 * Offline fallback response
 */
function offlineFallbackResponse(request) {
  const url = new URL(request.url);

  if (request.headers.get('accept')?.includes('text/html')) {
    return caches.match('./index.html');
  }

  if (url.pathname.endsWith('.js')) {
    return new Response('// Offline: Script unavailable', {
      headers: { 'Content-Type': 'application/javascript' }
    });
  }

  return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

// ============================================================
// BACKGROUND SYNC (Optional)
// ============================================================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-translations') {
    console.log('[SW] Background sync triggered.');
  }
});

// ============================================================
// PUSH NOTIFICATION (Stub)
// ============================================================
self.addEventListener('push', event => {
  const data = event.data?.json() || { title: 'Orthobitto', body: 'New update available.' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-96.png',
      vibrate: [100, 50, 100],
      data: { url: './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === './' && 'focus' in client) return client.focus();
      }
      return clients.openWindow('./');
    })
  );
});

console.log('[SW] Orthobitto Service Worker v4.1.2-github-pdf-fix loaded.');
