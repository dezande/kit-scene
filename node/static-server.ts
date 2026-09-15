// Serveur statique minimal pour dist/, sans dépendance.
// Utilisé par node/serve.ts et par les tests dans Chrome des apps.
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
};

export interface StaticServer {
	/** Adresse du site, avec « / » final (ex. http://localhost:8000/). */
	url: string;
	/** Arrête le serveur et coupe les connexions en cours. */
	close: () => Promise<void>;
}

/**
 * Sert le dossier `dir` sur `port` (0 : un port libre choisi par le système).
 * `onRequest` reçoit chaque requête servie (statut, méthode, URL), pour un journal.
 */
export function startStaticServer(dir: string, port: number, onRequest?: (line: string) => void): Promise<StaticServer> {
	const root = resolve(dir);

	/** Chemin du fichier demandé dans le dossier, ou null s'il en sort. Lève une erreur si l'URL est mal encodée. */
	function resolvePath(url: string): string | null {
		const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0] || '/');
		const path = normalize(join(root, pathname));
		return path === root || path.startsWith(root + sep) ? path : null;
	}

	const server: Server = createServer(async (request, response) => {
		try {
			let path = resolvePath(request.url ?? '/');
			if (!path) throw new Error('hors du dossier servi');
			if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
			const body = await readFile(path);
			response.writeHead(200, {
				'Content-Type': MIME_TYPES[extname(path)] ?? 'application/octet-stream',
				'Cache-Control': 'no-store',
			});
			response.end(request.method === 'HEAD' ? undefined : body);
		} catch {
			response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
			response.end('Introuvable');
		}
		onRequest?.(`${response.statusCode} ${request.method} ${request.url}`);
	});

	return new Promise((resolveStart, rejectStart) => {
		server.once('error', rejectStart);
		// Toutes les interfaces, comme avant : l'app reste joignable depuis un téléphone du réseau local.
		// L'adresse renvoyée utilise localhost, seule origine HTTP où le service worker est autorisé.
		server.listen(port, () => {
			const { port: actualPort } = server.address() as AddressInfo;
			resolveStart({
				url: `http://localhost:${actualPort}/`,
				close: () => new Promise((resolveClose) => {
					server.close(() => resolveClose());
					// Coupe aussi les connexions gardées ouvertes par le navigateur : le site devient injoignable.
					server.closeAllConnections();
				}),
			});
		});
	});
}
