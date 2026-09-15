// node/stamp-build.ts sur un faux build d'app, dans un vrai dépôt git temporaire :
// le nom du cache doit changer à chaque nouvelle version, même si le code est identique,
// et rester le même quand rien ne change (pas de retéléchargement inutile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('node/stamp-build.ts');
const SW_SOURCE = readFileSync('sw/sw.ts', 'utf8');

function git(dir: string, ...args: string[]): string {
	return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim();
}

/** Dépôt d'app temporaire, avec son package.json (champ kit). */
function makeApp(kit: object = { cachePrefix: 'mon-app', legacyCachePrefixes: ['ancien-nom'] }): string {
	const dir = mkdtempSync(join(tmpdir(), 'kit-scene-stamp-'));
	git(dir, 'init', '-q', '-b', 'main');
	writeFileSync(join(dir, '.gitignore'), 'dist/\n');
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mon-app', kit }));
	git(dir, 'add', '.');
	git(dir, 'commit', '-q', '-m', 'version 1');
	return dir;
}

/** Écrit un dist/ neuf, comme juste après la compilation, et lance le script. */
function stamp(dir: string, appCode = 'console.log("app");'): { cache: string; prefixes: string; assets: string; build: string } {
	rmSync(join(dir, 'dist'), { recursive: true, force: true });
	mkdirSync(join(dir, 'dist', 'kit', 'web'), { recursive: true });
	writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html>');
	writeFileSync(join(dir, 'dist', 'app.js'), appCode);
	writeFileSync(join(dir, 'dist', '.DS_Store'), 'x');
	writeFileSync(join(dir, 'dist', 'kit', 'web', 'build.js'), "export const BUILD = { version: '__APP_VERSION__', commit: '__APP_COMMIT__' };");
	// Le vrai service worker du kit (les annotations TypeScript ne gênent pas les remplacements).
	writeFileSync(join(dir, 'dist', 'sw.js'), SW_SOURCE);
	const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
	if (result.status !== 0) throw new Error(result.stderr);
	const sw = readFileSync(join(dir, 'dist', 'sw.js'), 'utf8');
	return {
		cache: sw.match(/const CACHE = '([^']+)'/)?.[1] ?? '',
		prefixes: sw.match(/const OWN_CACHE_PREFIXES: string\[\] = \[(.*)\]/)?.[1] ?? '',
		assets: sw.match(/const ASSETS: string\[\] = \[(.*)\]/)?.[1] ?? '',
		build: readFileSync(join(dir, 'dist', 'kit', 'web', 'build.js'), 'utf8'),
	};
}

function withApp(run: (dir: string) => void, kit?: object): void {
	const dir = makeApp(kit);
	try {
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test('version, commit, fichiers et préfixes de cache inscrits dans le build', () => {
	withApp((dir) => {
		const result = stamp(dir);
		assert.match(result.build, /version: '1'/);
		assert.match(result.build, new RegExp(`commit: '${git(dir, 'rev-parse', '--short=7', 'HEAD')}'`));
		assert.match(result.cache, /^mon-app-[0-9a-f]{12}$/);
		assert.equal(result.prefixes, "'mon-app-', 'ancien-nom-'");
		assert.equal(result.assets, "'./', './app.js', './index.html', './kit/web/build.js'", 'fichiers cachés et sw.js exclus');
	});
});

test('même version, même contenu : même cache (rien à retélécharger)', () => {
	withApp((dir) => assert.equal(stamp(dir).cache, stamp(dir).cache));
});

test('nouvelle version : nouveau cache, même si le code de l’app n’a pas changé', () => {
	withApp((dir) => {
		const v1 = stamp(dir);
		git(dir, 'commit', '-q', '--allow-empty', '-m', 'version 2');
		const v2 = stamp(dir);
		assert.match(v2.build, /version: '2'/);
		assert.notEqual(v2.cache, v1.cache);
	});
});

test('code modifié : nouveau cache', () => {
	withApp((dir) => assert.notEqual(stamp(dir).cache, stamp(dir, 'console.log("app modifiée");').cache));
});

test('préfixe de cache absent ou invalide : échec clair', () => {
	for (const kit of [{}, { cachePrefix: 'Mon App' }]) {
		withApp((dir) => assert.throws(() => stamp(dir), /kit\.cachePrefix/), kit);
	}
});
