// Finalise le build de l'app (lancé depuis sa racine, après la compilation) :
// 1. inscrit dans kit/web/build.js le numéro de version (nombre de commits) et le commit court ;
// 2. inscrit dans sw.js la liste de tous les fichiers de dist/ à mettre en cache, et les préfixes
//    de cache de l'app (package.json, champ kit) ;
// 3. nomme le cache hors-ligne d'après le contenu de ces fichiers, numéro de version compris.
//    Toute nouvelle version change ce nom, donc les appareils où l'app est installée se mettent
//    à jour ; sans modification, rien n'est retéléchargé.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { readKitConfig } from './config.ts';

const DIST = 'dist';
const BUILD_FILE = 'kit/web/build.js';

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

function git(args: string[]): string | null {
	try {
		return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return null;
	}
}

function replaceIn(file: string, placeholder: string, value: string): void {
	const path = join(DIST, file);
	const content = readFileSync(path, 'utf8');
	if (!content.includes(placeholder)) fail(`${placeholder} introuvable dans ${path}.`);
	writeFileSync(path, content.replaceAll(placeholder, value));
}

const quoted = (values: string[]): string => values.map((value) => `'${value}'`).join(', ');

let config;
try {
	config = readKitConfig();
} catch (error) {
	fail((error as Error).message);
}

/* ---------- 1. Numéro de version ---------- */

if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
	fail('Dépôt cloné partiellement : le numéro de version serait faux (utilisez fetch-depth: 0).');
}
const count = git(['rev-list', '--count', 'HEAD']);
const commit = git(['rev-parse', '--short=7', 'HEAD']);
// Modifications locales de l'app (le kit, sous-module, a son propre état).
const modified = Boolean(git(['status', '--porcelain', '--ignore-submodules=dirty']));
const version = count ?? 'inconnue';
const commitLabel = commit ? `${commit}${modified ? ' + modifications locales' : ''}` : 'inconnu';

replaceIn(BUILD_FILE, '__APP_VERSION__', version);
replaceIn(BUILD_FILE, '__APP_COMMIT__', commitLabel);

/* ---------- 2. Fichiers mis en cache et préfixes ---------- */

// Tout dist/ sauf le service worker lui-même et les fichiers cachés (.DS_Store…), avec des « / ».
const files = readdirSync(DIST, { recursive: true, encoding: 'utf8' })
	.map((name) => name.split(sep).join('/'))
	.filter((name) => name !== 'sw.js' && !name.split('/').some((part) => part.startsWith('.')))
	.filter((name) => statSync(join(DIST, name)).isFile())
	.sort();
replaceIn('sw.js', "'__ASSETS__'", quoted(['./', ...files.map((file) => `./${file}`)]));
replaceIn('sw.js', "'__OWN_CACHE_PREFIXES__'", quoted([config.cachePrefix, ...config.legacyCachePrefixes].map((prefix) => `${prefix}-`)));
replaceIn('sw.js', '__CACHE_PREFIX__', config.cachePrefix);

/* ---------- 3. Nom du cache hors-ligne ---------- */

const hash = createHash('sha256');
for (const file of files) {
	hash.update(`${file}\0`);
	hash.update(readFileSync(join(DIST, file)));
}
const buildHash = hash.digest('hex').slice(0, 12);
replaceIn('sw.js', '__BUILD_HASH__', buildHash);

console.log(`Version ${version} (${commitLabel}), ${files.length} fichiers, cache ${config.cachePrefix}-${buildHash}`);
