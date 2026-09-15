// Vérification du build (node/check-dist.ts) et lecture de la configuration (node/config.ts),
// dans une app temporaire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readKitConfig } from '../node/config.ts';

const SCRIPT = resolve('node/check-dist.ts');

/** App temporaire avec un build complet ; `change` peut l'abîmer avant la vérification. */
function withApp(run: (dir: string) => void, pkg: object = { name: 'mon-app', kit: { cachePrefix: 'mon-app', requiredFiles: ['content/slides.js'] } }): void {
	const dir = mkdtempSync(join(tmpdir(), 'kit-scene-check-'));
	try {
		writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
		for (const sub of ['kit/web', 'icons', 'content']) mkdirSync(join(dir, 'dist', sub), { recursive: true });
		for (const file of ['index.html', 'style.css', 'app.js', 'kit/web/build.js', 'kit/web/wake-lock.js', 'kit/web/updates.js', 'icons/icon-192.png', 'content/slides.js']) {
			writeFileSync(join(dir, 'dist', file), 'x');
		}
		writeFileSync(join(dir, 'dist', 'manifest.json'), JSON.stringify({ icons: [{ src: 'icons/icon-192.png' }] }));
		writeFileSync(join(dir, 'dist', 'sw.js'), "const CACHE = '__CACHE_PREFIX__-__BUILD_HASH__';");
		run(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function check(dir: string): { ok: boolean; output: string } {
	const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
	return { ok: result.status === 0, output: result.stdout + result.stderr };
}

test('build complet : accepté', () => {
	withApp((dir) => assert.deepEqual(check(dir), { ok: true, output: 'Build complet.\n' }));
});

test('fichier de base, fichier du kit, icône du manifest ou fichier requis par l’app manquant : refusé avec la raison', () => {
	for (const [file, reason] of [
		['app.js', 'fichier de base'],
		['kit/web/wake-lock.js', 'kit'],
		['icons/icon-192.png', 'icône du manifest'],
		['content/slides.js', 'kit.requiredFiles'],
	]) {
		withApp((dir) => {
			rmSync(join(dir, 'dist', file));
			const result = check(dir);
			assert.equal(result.ok, false, file);
			assert.match(result.output, new RegExp(`${file.replaceAll('.', '\\.')} manquant \\([^)]*${reason.replaceAll('.', '\\.')}`), file);
		});
	}
});

test('service worker qui ne vient pas du kit : refusé', () => {
	withApp((dir) => {
		writeFileSync(join(dir, 'dist', 'sw.js'), "const CACHE = 'autre';");
		const result = check(dir);
		assert.equal(result.ok, false);
		assert.match(result.output, /sw\.js ne vient pas du kit/);
	});
});

test('configuration absente : refusé avec un message clair', () => {
	withApp((dir) => {
		const result = check(dir);
		assert.equal(result.ok, false);
		assert.match(result.output, /kit\.cachePrefix/);
	}, { name: 'sans-kit' });
});

test('readKitConfig : valeurs par défaut et validation du préfixe', () => {
	const dir = mkdtempSync(join(tmpdir(), 'kit-scene-config-'));
	try {
		const write = (pkg: object): void => writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
		write({ name: 'app', homepage: 'https://exemple.test/app/', kit: { cachePrefix: 'app' } });
		assert.deepEqual(readKitConfig(dir), { name: 'app', homepage: 'https://exemple.test/app/', cachePrefix: 'app', legacyCachePrefixes: [], requiredFiles: [] });
		write({ name: 'app', kit: { name: 'Mon App', cachePrefix: 'app-2', legacyCachePrefixes: ['ancien'], requiredFiles: ['a.js'] } });
		assert.deepEqual(readKitConfig(dir), { name: 'Mon App', homepage: '', cachePrefix: 'app-2', legacyCachePrefixes: ['ancien'], requiredFiles: ['a.js'] });
		for (const cachePrefix of [undefined, '', 'Mon App', 'app_1', 'app/..']) {
			write({ kit: { cachePrefix } });
			assert.throws(() => readKitConfig(dir), /kit\.cachePrefix/, String(cachePrefix));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
