/* Stockage de l'app : lecture et écriture sûres, et demande de stockage persistant. */

/**
 * Valeur JSON enregistrée sous `key`, sinon sous l'une des `legacyKeys` (anciens noms de l'app),
 * sinon null. Ne lève jamais d'erreur (stockage indisponible, données abîmées).
 */
export function readStored(key: string, ...legacyKeys: string[]): unknown {
	try {
		for (const k of [key, ...legacyKeys]) {
			const raw = localStorage.getItem(k);
			if (raw !== null) return JSON.parse(raw);
		}
	} catch {
		// Données abîmées ou stockage indisponible.
	}
	return null;
}

/** Enregistre `value` en JSON. Stockage indisponible : gardé pour la session seulement, sans erreur. */
export function writeStored(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Mode privé, stockage plein…
	}
}

export type StorageState = 'persistant' | 'non garanti' | 'inconnu';

/**
 * Demande au navigateur de ne jamais effacer de lui-même les données de l'app (réglages, cache
 * hors-ligne), même en manque de place. Renvoie l'état obtenu.
 */
export async function requestPersistentStorage(): Promise<StorageState> {
	try {
		if (!navigator.storage?.persist) return 'inconnu';
		if (await navigator.storage.persisted()) return 'persistant';
		return (await navigator.storage.persist()) ? 'persistant' : 'non garanti';
	} catch {
		return 'inconnu';
	}
}
