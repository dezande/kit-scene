// Réglages du kit propres à chaque app, lus dans son package.json (champ « kit »).
import { readFileSync } from 'node:fs';

export interface KitConfig {
	/** Nom de l'app, affiché par le serveur local. */
	name: string;
	/** Adresse publiée (GitHub Pages), avec « / » final. */
	homepage: string;
	/** Préfixe des caches hors-ligne, ex. « analyseur-q » → analyseur-q-<empreinte>. */
	cachePrefix: string;
	/** Anciens préfixes de cette app (renommage) : leurs caches sont supprimés aussi. */
	legacyCachePrefixes: string[];
	/** Fichiers qui doivent exister dans dist/, en plus des fichiers de base. */
	requiredFiles: string[];
}

interface PackageJson {
	name?: string;
	homepage?: string;
	kit?: Partial<Omit<KitConfig, 'name' | 'homepage'>> & { name?: string };
}

/** Configuration de l'app du dossier courant. Échoue avec un message clair si elle est incomplète. */
export function readKitConfig(dir = '.'): KitConfig {
	const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as PackageJson;
	const kit = pkg.kit ?? {};
	if (!kit.cachePrefix || !/^[a-z0-9-]+$/.test(kit.cachePrefix)) {
		throw new Error('package.json : champ kit.cachePrefix manquant ou invalide (lettres minuscules, chiffres et tirets).');
	}
	return {
		name: kit.name ?? pkg.name ?? 'app',
		homepage: pkg.homepage ?? '',
		cachePrefix: kit.cachePrefix,
		legacyCachePrefixes: kit.legacyCachePrefixes ?? [],
		requiredFiles: kit.requiredFiles ?? [],
	};
}
