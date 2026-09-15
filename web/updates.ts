/*
 * Hors-ligne et mises à jour : enregistre le service worker (sw/sw.ts) et installe les nouvelles
 * versions publiées.
 *
 * Une nouvelle version est cherchée à l'ouverture et à chaque retour au premier plan. Quand elle
 * s'installe, l'app se recharge seulement si `canReload()` le permet (personne n'a touché l'écran,
 * rien en cours) ; sinon elle s'affichera à l'ouverture suivante. Jamais de rechargement en plein tour.
 */

export interface UpdateOptions {
	/** Vrai si l'app peut se recharger maintenant sans gêner l'artiste. */
	canReload: () => boolean;
	/** Retour au premier plan, avant la recherche de mise à jour (ex. oublier les touchers). */
	onVisible?: () => void;
	/** Journal de diagnostic. */
	log?: (message: string) => void;
}

export function setupUpdates({ canReload, onVisible, log }: UpdateOptions): void {
	if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState !== 'visible') return;
		onVisible?.();
		navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {});
	});

	// Au tout premier chargement, la prise en main par le premier service worker n'est pas une
	// nouvelle version : rien à recharger. Les suivantes, si.
	let hadController = Boolean(navigator.serviceWorker.controller);
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		log?.('nouvelle version installée');
		if (hadController && canReload()) location.reload();
		hadController = true;
	});

	const register = (): void => {
		navigator.serviceWorker.register('sw.js').catch(() => {});
	};
	if (document.readyState === 'complete') register();
	else window.addEventListener('load', register);
}

/** Noms des caches hors-ligne de l'app (préfixe du package.json, champ kit.cachePrefix), pour les réglages. */
export async function appCacheNames(prefix: string): Promise<string[]> {
	if (!('caches' in window) || !navigator.serviceWorker?.controller) return [];
	return (await caches.keys().catch(() => [])).filter((name) => name.startsWith(`${prefix}-`));
}
