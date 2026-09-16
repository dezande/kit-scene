// Vérification du journal des versions (node/check-changelog.ts) : la forme du fichier,
// et l'obligation de décrire ce qu'on change, dans un dépôt git temporaire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('node/check-changelog.ts');

const VALID = `# Journal des versions

## [Non publié]

- Travail en cours.

## [1.10.0] — 2026-09-16

### Ajouté

- Une nouveauté.

## [1.9.0] — 2026-09-15

### Ajouté

- Le début.

[1.10.0]: https://exemple.test/releases/tag/v1.10.0
[1.9.0]: https://exemple.test/releases/tag/v1.9.0
`;

function git(dir: string, ...args: string[]): string {
	return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim();
}

/** Dépôt temporaire avec un journal valide et un fichier de code déjà commités. */
function makeRepo(changelog = VALID): string {
	const dir = mkdtempSync(join(tmpdir(), 'kit-scene-journal-'));
	git(dir, 'init', '-q', '-b', 'main');
	writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
	writeFileSync(join(dir, 'code.ts'), 'export const a = 1;\n');
	git(dir, 'add', '.');
	git(dir, 'commit', '-q', '-m', 'départ');
	return dir;
}

function check(dir: string, ...args: string[]): { ok: boolean; output: string } {
	const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
	return { ok: result.status === 0, output: result.stdout + result.stderr };
}

/** Lance la vérification sur un journal seul, sans dépôt git. */
function checkText(changelog: string): { ok: boolean; output: string } {
	const dir = mkdtempSync(join(tmpdir(), 'kit-scene-journal-'));
	try {
		writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
		return check(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test('journal bien tenu : accepté', () => {
	assert.equal(checkText(VALID).ok, true);
});

test('journal manquant : refusé', () => {
	const dir = mkdtempSync(join(tmpdir(), 'kit-scene-journal-'));
	try {
		const { ok, output } = check(dir);
		assert.equal(ok, false);
		assert.match(output, /CHANGELOG\.md manquant/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('forme du journal : chaque défaut est refusé avec la raison', () => {
	const cases: [string, RegExp][] = [
		['# Journal des versions\n\nRien.\n', /aucune version/],
		[VALID.replace('## [1.9.0] — 2026-09-15', '## [1.9.0]'), /date manquante/],
		[VALID.replace('## [1.9.0] — 2026-09-15', '## [1.9.0] — 15\/09\/2026'), /illisible/],
		[VALID.replace('## [1.9.0] — 2026-09-15', '## [1.9] — 2026-09-15'), /MAJEUR\.MINEUR\.CORRECTIF/],
		[VALID.replace('## [1.9.0] — 2026-09-15', '## [1.10.0] — 2026-09-15'), /écrite deux fois/],
		[VALID.replace('## [1.10.0] — 2026-09-16', '## [1.8.0] — 2026-09-16'), /devrait venir avant/],
		[VALID.replace('[1.9.0]: https://exemple.test/releases/tag/v1.9.0\n', ''), /lien vers la publication manquant/],
		[VALID.replace('### Ajouté\n\n- Une nouveauté.\n', ''), /section vide/],
		[VALID.replace('## [Non publié]', '## Non publié'), /titre de version illisible/],
		[VALID.replace('## [Non publié]\n\n- Travail en cours.\n\n', '').replace('[1.9.0]: ', '## [Non publié]\n\n- Tard.\n\n[1.9.0]: '), /première section/],
	];
	for (const [changelog, reason] of cases) {
		const { ok, output } = checkText(changelog);
		assert.equal(ok, false, `aurait dû être refusé : ${String(reason)}`);
		assert.match(output, reason);
	}
});

test('code modifié sans une ligne dans le journal : refusé, en nommant les fichiers', () => {
	const dir = makeRepo();
	try {
		writeFileSync(join(dir, 'code.ts'), 'export const a = 2;\n');
		git(dir, 'commit', '-qam', 'changement discret');
		const { ok, output } = check(dir, '--base', 'HEAD~1');
		assert.equal(ok, false);
		assert.match(output, /CHANGELOG\.md n'a pas changé/);
		assert.match(output, /code\.ts/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('code modifié et journal mis à jour : accepté', () => {
	const dir = makeRepo();
	try {
		writeFileSync(join(dir, 'code.ts'), 'export const a = 2;\n');
		writeFileSync(join(dir, 'CHANGELOG.md'), VALID.replace('- Travail en cours.', '- Travail en cours.\n- `code.ts` : a vaut 2.'));
		git(dir, 'commit', '-qam', 'changement expliqué');
		assert.equal(check(dir, '--base', 'HEAD~1').ok, true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('journal seul modifié, ou commit marqué « [sans journal] » : accepté', () => {
	const dir = makeRepo();
	try {
		writeFileSync(join(dir, 'CHANGELOG.md'), VALID.replace('- Travail en cours.', '- Travail en cours, mieux dit.'));
		git(dir, 'commit', '-qam', 'journal relu');
		assert.equal(check(dir, '--base', 'HEAD~1').ok, true);

		writeFileSync(join(dir, 'code.ts'), 'export const a = 3;\n');
		git(dir, 'commit', '-qam', 'espaces [sans journal]');
		assert.equal(check(dir, '--base', 'HEAD~1').ok, true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('base inconnue (branche neuve, historique tronqué) : la forme est vérifiée, pas la mise à jour', () => {
	const dir = makeRepo();
	try {
		writeFileSync(join(dir, 'code.ts'), 'export const a = 4;\n');
		git(dir, 'commit', '-qam', 'changement discret');
		for (const base of ['0000000000000000000000000000000000000000', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', '']) {
			assert.equal(check(dir, '--base', base).ok, true, `base « ${base} »`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
