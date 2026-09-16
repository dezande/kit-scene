// Vérifie le journal des versions (CHANGELOG.md), pour le kit comme pour une app :
// 1. la forme : versions MAJEUR.MINEUR.CORRECTIF, datées, en ordre décroissant, sans doublon,
//    avec du contenu et un lien vers la publication ; « Non publié » admis en tête, sans date ;
// 2. la mise à jour : avec --base <ref>, toute modification autre que le journal lui-même doit
//    s'accompagner d'une ligne dans le journal — un commit marqué « [sans journal] » en dispense.
//
// Usage : node node/check-changelog.ts [--base <ref>] [--head <ref>] [--file <chemin>]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const UNRELEASED = 'Non publié';
const SKIP_MARKER = '[sans journal]';

interface Entry {
	version: string;
	date: string | null;
	body: string;
	line: number;
}

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
}

function git(args: string[]): string | null {
	try {
		return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return null;
	}
}

/** Numéro de version comparable : 1.10.0 vient bien après 1.9.0. */
const rank = (version: string): number => version.split('.').reduce((total, part) => total * 1000 + Number(part), 0);

/** Découpe le journal en versions ; les titres mal formés sont signalés. */
export function parseChangelog(text: string): { entries: Entry[]; errors: string[] } {
	const lines = text.split('\n');
	const entries: Entry[] = [];
	const errors: string[] = [];
	let current: Entry | null = null;

	lines.forEach((line, index) => {
		if (!line.startsWith('## ')) {
			if (current) current.body += `${line}\n`;
			return;
		}
		const match = /^## \[([^\]]+)\](?:\s*[—-]\s*(.+))?\s*$/.exec(line);
		if (!match) {
			errors.push(`ligne ${index + 1} : titre de version illisible (attendu « ## [1.2.3] — 2026-09-15 »), lu « ${line.trim()} »`);
			current = null;
			return;
		}
		current = { version: match[1]!, date: match[2]?.trim() ?? null, body: '', line: index + 1 };
		entries.push(current);
	});
	return { entries, errors };
}

/** Tout ce qui cloche dans le journal, du point de vue d'une app qui veut savoir quoi mettre à jour. */
export function checkChangelog(text: string): string[] {
	const { entries, errors } = parseChangelog(text);
	const versions = entries.filter((entry) => entry.version !== UNRELEASED);

	if (entries.length === 0) errors.push('aucune version : le journal doit contenir au moins « ## [1.0.0] — 2026-09-15 ».');
	for (const [index, entry] of entries.entries()) {
		const where = `ligne ${entry.line}, « ${entry.version} »`;
		if (entry.version === UNRELEASED) {
			if (index !== 0) errors.push(`${where} : « ${UNRELEASED} » doit être la première section.`);
			if (entry.date) errors.push(`${where} : « ${UNRELEASED} » ne porte pas de date.`);
		} else {
			if (!/^\d+\.\d+\.\d+$/.test(entry.version)) errors.push(`${where} : numéro attendu MAJEUR.MINEUR.CORRECTIF.`);
			if (!entry.date) errors.push(`${where} : date manquante (« ## [${entry.version}] — 2026-09-15 »).`);
			else if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number.isNaN(Date.parse(entry.date))) errors.push(`${where} : date « ${entry.date} » illisible (attendu AAAA-MM-JJ).`);
			if (!new RegExp(`^\\[${entry.version.replaceAll('.', '\\.')}\\]:\\s*\\S+`, 'm').test(text)) {
				errors.push(`${where} : lien vers la publication manquant en bas du fichier (« [${entry.version}]: https://…/releases/tag/v${entry.version} »).`);
			}
		}
		if (entry.body.replaceAll('#', '').trim() === '') errors.push(`${where} : section vide, dites ce qui a changé.`);
	}

	const seen = new Set<string>();
	for (const entry of versions) {
		if (seen.has(entry.version)) errors.push(`ligne ${entry.line} : version ${entry.version} écrite deux fois.`);
		seen.add(entry.version);
	}
	for (const [index, entry] of versions.slice(1).entries()) {
		const previous = versions[index]!;
		if (rank(entry.version) >= rank(previous.version)) errors.push(`ligne ${entry.line} : ${entry.version} devrait venir avant ${previous.version} (la plus récente en premier).`);
	}
	return errors;
}

/* ---------- 1. Forme du journal ---------- */

const file = arg('file') ?? 'CHANGELOG.md';
const problems: string[] = [];

if (!existsSync(file)) {
	console.error(`${file} manquant : chaque version publiée doit être décrite dans le journal.`);
	process.exit(1);
}
problems.push(...checkChangelog(readFileSync(file, 'utf8')));

/* ---------- 2. Journal mis à jour avec le reste ---------- */

const base = arg('base');
const head = arg('head') ?? 'HEAD';

if (base && !/^0+$/.test(base)) {
	if (git(['rev-parse', '--verify', `${base}^{commit}`]) === null) {
		console.log(`Base ${base} inconnue (branche neuve ou historique tronqué) : mise à jour du journal non vérifiée.`);
	} else {
		const changed = (git(['diff', '--name-only', `${base}...${head}`]) ?? '').split('\n').filter(Boolean);
		const messages = git(['log', '--format=%B', `${base}..${head}`]) ?? '';
		const others = changed.filter((name) => name !== file);
		if (others.length > 0 && !changed.includes(file) && !messages.includes(SKIP_MARKER)) {
			const list = others.slice(0, 10).join(', ') + (others.length > 10 ? `, … (${others.length} fichiers)` : '');
			problems.push(`${file} n'a pas changé alors que le reste a changé : ${list}.\n  Ajoutez ce que vous avez fait sous « ## [${UNRELEASED}] », ou marquez le commit « ${SKIP_MARKER} ».`);
		} else if (changed.length > 0) {
			console.log(`Journal à jour pour ${changed.length} fichier(s) modifié(s) depuis ${base}.`);
		}
	}
}

if (problems.length > 0) {
	console.error(`Journal des versions (${file}) :\n- ${problems.join('\n- ')}`);
	process.exit(1);
}
console.log(`Journal des versions : ${file} en ordre.`);
