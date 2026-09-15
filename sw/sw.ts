/*
 * Service worker : tout est mis en cache à l'installation, puis servi hors-ligne.
 * Compilé en dist/sw.js par l'app ; les valeurs __…__ sont remplacées au build par node/stamp-build.ts.
 */

// Script classique (pas de module) : les service workers modules ne sont pas lus partout.
const sw = self as unknown as ServiceWorkerGlobalScope;

// Préfixe de l'app (package.json, kit.cachePrefix) et empreinte du contenu du build : chaque
// modification publiée, numéro de version compris, renomme le cache et met à jour les appareils.
const CACHE = '__CACHE_PREFIX__-__BUILD_HASH__';
// Toutes les apps de dezande.github.io partagent le même espace de caches (même origine) :
// on ne supprime que les anciens caches de cette app, sous son nom actuel ou ses anciens noms
// (kit.legacyCachePrefixes), jamais ceux des autres apps.
const OWN_CACHE_PREFIXES: string[] = ['__OWN_CACHE_PREFIXES__'];
// Tous les fichiers du build, sauf ce service worker.
const ASSETS: string[] = ['__ASSETS__'];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE)
			.then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys
				.filter((key) => key !== CACHE && OWN_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
				.map((key) => caches.delete(key))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET' || new URL(request.url).origin !== sw.location.origin) return;

	event.respondWith((async () => {
		const cache = await caches.open(CACHE);
		const cached = await cache.match(request, { ignoreSearch: true });
		if (cached) return cached;
		if (request.mode === 'navigate') {
			const shell = await cache.match('./index.html');
			if (shell) return shell;
		}
		return fetch(request);
	})());
});
