// Serveur local (node/static-server.ts) : fichiers servis, types, 404, et surtout aucun accès
// en dehors du dossier servi, même avec des adresses piégées.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStaticServer, type StaticServer } from '../node/static-server.ts';

let root: string;
let server: StaticServer;

before(async () => {
	root = mkdtempSync(join(tmpdir(), 'kit-scene-server-'));
	mkdirSync(join(root, 'dist', 'images'), { recursive: true });
	writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><title>app</title>');
	writeFileSync(join(root, 'dist', 'app.js'), 'console.log(1);');
	writeFileSync(join(root, 'dist', 'images', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
	// Fichier voisin du dossier servi : ne doit jamais être lisible.
	writeFileSync(join(root, 'secret.txt'), 'SECRET');
	server = await startStaticServer(join(root, 'dist'), 0);
});

after(async () => {
	await server?.close();
	rmSync(root, { recursive: true, force: true });
});

/** Requête HTTP brute, sans normalisation de l'adresse par le client. */
function rawGet(path: string, method = 'GET'): Promise<{ status: number; body: string }> {
	const { port } = new URL(server.url);
	return new Promise((resolve, reject) => {
		const socket = connect(Number(port), 'localhost', () => {
			socket.write(`${method} ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
		});
		let data = '';
		socket.on('data', (chunk) => { data += chunk.toString(); });
		socket.on('end', () => {
			const status = Number(data.match(/^HTTP\/1\.1 (\d{3})/)?.[1] ?? 0);
			resolve({ status, body: data.split('\r\n\r\n').slice(1).join('\r\n\r\n') });
		});
		socket.on('error', reject);
	});
}

test('sert les fichiers avec le bon type, index.html pour un dossier, query string ignorée', async () => {
	const index = await fetch(server.url);
	assert.equal(index.status, 200);
	assert.match(index.headers.get('content-type') ?? '', /^text\/html/);
	assert.equal(index.headers.get('cache-control'), 'no-store');
	assert.match(await index.text(), /<title>app<\/title>/);

	const js = await fetch(new URL('app.js?v=3', server.url));
	assert.match(js.headers.get('content-type') ?? '', /^text\/javascript/);
	const svg = await fetch(new URL('images/logo.svg', server.url));
	assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
});

test('fichier absent : 404', async () => {
	assert.equal((await fetch(new URL('absent.js', server.url))).status, 404);
});

test('HEAD : en-têtes sans contenu', async () => {
	const response = await rawGet('/app.js', 'HEAD');
	assert.equal(response.status, 200);
	assert.equal(response.body, '');
});

test('adresses piégées : jamais de fichier hors du dossier servi', async () => {
	for (const path of ['/../secret.txt', '/images/../../secret.txt', '/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt', '/..%5csecret.txt', '//../secret.txt']) {
		const response = await rawGet(path);
		assert.notEqual(response.status, 200, `${path} ne doit pas être servi`);
		assert.doesNotMatch(response.body, /SECRET/, `${path} ne doit pas révéler le fichier`);
	}
});

test('adresse mal encodée : 404, et le serveur continue de répondre', async () => {
	assert.equal((await rawGet('/%E0%A4%A')).status, 404);
	assert.equal((await fetch(server.url)).status, 200);
});
