// Vérifie que le build de l'app est complet (lancé depuis sa racine, avant node/stamp-build.ts) :
// fichiers de base, fichiers du kit, icônes du manifest et fichiers propres à l'app (kit.requiredFiles).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readKitConfig } from './config.ts';

const DIST = 'dist';
const errors: string[] = [];
const expectFile = (file: string, reason: string): void => {
	if (!existsSync(join(DIST, file))) errors.push(`${file} manquant (${reason})`);
};

try {
	const config = readKitConfig();
	for (const file of ['index.html', 'style.css', 'app.js', 'sw.js', 'manifest.json']) expectFile(file, 'fichier de base');
	for (const file of ['kit/web/build.js', 'kit/web/wake-lock.js', 'kit/web/updates.js']) expectFile(file, 'kit');
	for (const file of config.requiredFiles) expectFile(file, 'package.json, kit.requiredFiles');

	if (existsSync(join(DIST, 'manifest.json'))) {
		const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')) as { icons: { src: string }[]; orientation?: string };
		for (const icon of manifest.icons) expectFile(icon.src, 'icône du manifest');
	}
	const sw = existsSync(join(DIST, 'sw.js')) ? readFileSync(join(DIST, 'sw.js'), 'utf8') : '';
	if (sw && !sw.includes('__CACHE_PREFIX__')) errors.push('sw.js ne vient pas du kit (kit/sw/sw.ts)');
} catch (error) {
	errors.push((error as Error).message);
}

if (errors.length > 0) {
	console.error(`Build incomplet :\n- ${errors.join('\n- ')}`);
	process.exit(1);
}
console.log('Build complet.');
