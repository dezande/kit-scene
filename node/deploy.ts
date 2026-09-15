// Déploiement : le déploiement lui-même est fait par GitHub Actions à chaque push
// sur main. Ce script vérifie tout en local avant de pousser, pousse, puis suit
// l'exécution jusqu'à la mise en ligne.
//
// Usage (depuis la racine de l'app) : npm run deploy
//         npm run deploy -- --dry-run   (vérifications, build et tests, sans push)
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BRANCH = 'main';
const WORKFLOW = 'ci.yml';
const dryRun = process.argv.includes('--dry-run');

function fail(message: string): never {
	console.error(`\n✗ ${message}`);
	process.exit(1);
}

function step(title: string): void {
	console.log(`\n▸ ${title}`);
}

/** Lance une commande en affichant sa sortie ; lève une erreur si elle échoue. */
function run(command: string, args: string[]): void {
	const result = spawnSync(command, args, { stdio: 'inherit' });
	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} a échoué`);
}

/** Lance une commande et renvoie sa sortie standard. */
function output(command: string, args: string[]): string {
	return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function hasCommand(command: string): boolean {
	return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

async function waitFor<T>(check: () => Promise<T | null>, timeoutMs: number, intervalMs: number): Promise<T | null> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const value = await check();
			if (value !== null) return value;
		} catch {
			// Nouvel essai au prochain intervalle.
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return null;
}

/* ---------- 1. État du dépôt ---------- */

step('Vérification du dépôt');
const branch = output('git', ['branch', '--show-current']);
if (branch !== BRANCH) fail(`Le déploiement se fait depuis « ${BRANCH} » (branche actuelle : « ${branch} »).`);
if (output('git', ['status', '--porcelain'])) {
	fail('Des modifications ne sont pas commitées. Commitez-les ou mettez-les de côté avant de déployer.');
}
run('git', ['fetch', '--quiet', 'origin', BRANCH]);
const behind = Number(output('git', ['rev-list', '--count', `HEAD..origin/${BRANCH}`]));
if (behind > 0) fail(`La branche locale a ${behind} commit(s) de retard sur origin/${BRANCH} : faites « git pull » d'abord.`);
const ahead = Number(output('git', ['rev-list', '--count', `origin/${BRANCH}..HEAD`]));
if (ahead === 0 && !dryRun) {
	console.log(`\nRien à déployer : ${BRANCH} est déjà à jour sur GitHub.`);
	process.exit(0);
}
console.log(`${ahead} commit(s) à publier.`);

// Le kit (sous-module src/kit) : GitHub Actions doit pouvoir récupérer la version utilisée.
step('Vérification du kit (src/kit)');
if (output('git', ['-C', 'src/kit', 'status', '--porcelain'])) {
	fail('Le kit (src/kit) a des modifications non commitées : commitez-les et poussez-les dans kit-scene d\'abord.');
}
run('git', ['-C', 'src/kit', 'fetch', '--quiet', 'origin']);
if (!output('git', ['-C', 'src/kit', 'branch', '-r', '--contains', 'HEAD'])) {
	fail('La version du kit utilisée n\'est pas poussée sur GitHub (kit-scene) : poussez-la avant de déployer.');
}
console.log(`Kit ${output('git', ['-C', 'src/kit', 'rev-parse', '--short=7', 'HEAD'])}, publié.`);

/* ---------- 2. Types, tests unitaires, build, tests dans Chrome ---------- */

try {
	step('Vérification des types');
	run('npm', ['run', '--silent', 'typecheck']);
	step('Tests unitaires');
	run('npm', ['test', '--silent']);
	step('Build');
	run('npm', ['run', '--silent', 'build']);
	step('Tests dans Chrome');
	run('npm', ['run', '--silent', 'test:e2e']);
} catch {
	fail('Vérifications en échec : rien n\'a été poussé.');
}

const cacheName = readFileSync('dist/sw.js', 'utf8').match(/const CACHE = '([^']+)'/)?.[1];
if (!cacheName) fail('Nom du cache introuvable dans dist/sw.js.');

if (dryRun) {
	console.log(`\n✓ Simulation réussie (cache ${cacheName}). Rien n'a été poussé.`);
	process.exit(0);
}

/* ---------- 3. Push : GitHub Actions prend le relais ---------- */

step('Push');
run('git', ['push', '--quiet', 'origin', BRANCH]);
const sha = output('git', ['rev-parse', 'HEAD']);
console.log(`Poussé : ${sha.slice(0, 7)}`);

if (!hasCommand('gh')) {
	console.log('\nGitHub CLI (gh) absent : suivez le déploiement dans l\'onglet Actions du dépôt.');
	process.exit(0);
}

step('GitHub Actions');
const runId = await waitFor(async () => {
	const id = output('gh', ['run', 'list', '--commit', sha, '--workflow', WORKFLOW, '--json', 'databaseId', '--jq', '.[0].databaseId']);
	return id || null;
}, 90_000, 3_000);
if (!runId) fail('L\'exécution GitHub Actions n\'est pas apparue. Vérifiez l\'onglet Actions du dépôt.');

const watch = spawnSync('gh', ['run', 'watch', runId, '--exit-status', '--interval', '5'], { stdio: 'inherit' });
if (watch.status !== 0) fail(`La CI a échoué. Détails : gh run view ${runId} --log-failed`);

step('Vérification du site');
const { homepage } = JSON.parse(readFileSync('package.json', 'utf8')) as { homepage: string };
const online = await waitFor(async () => {
	const response = await fetch(new URL(`sw.js?t=${Date.now()}`, homepage), { cache: 'no-store' });
	return response.ok && (await response.text()).includes(cacheName) ? true : null;
}, 180_000, 5_000);
if (!online) fail(`${homepage} ne sert pas encore ${cacheName} après 3 minutes. Revérifiez dans quelques minutes.`);

console.log(`\n✓ En ligne : ${homepage} (${cacheName})`);
console.log('Sur le téléphone : ouvrez l\'app une fois avec du réseau, fermez-la et rouvrez-la.');
