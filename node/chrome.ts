// Pilotage de Chrome sans interface pour les tests de bout en bout, sans dépendance :
// Chrome est lancé avec son protocole de débogage (Chrome DevTools Protocol), piloté par WebSocket.
// Documentation du protocole : https://chromedevtools.github.io/devtools-protocol/
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/** Écran simulé : un téléphone de taille courante (iPhone 13 à 15). */
export const SCREEN = { width: 390, height: 844 } as const;

/** Emplacements essayés, dans l'ordre, pour trouver Chrome. */
const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	process.env.CHROME_BIN, // défini sur les machines GitHub Actions
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'google-chrome',
	'google-chrome-stable',
	'chromium',
	'chromium-browser',
];

function findChrome(): string {
	for (const candidate of CHROME_CANDIDATES) {
		if (!candidate) continue;
		const found = candidate.includes('/')
			? existsSync(candidate)
			: spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0;
		if (found) return candidate;
	}
	throw new Error('Chrome introuvable : installez Google Chrome, ou indiquez son chemin dans la variable CHROME_PATH.');
}

/* ================= Navigateur ================= */

export class Browser {
	readonly #process: ChildProcess;
	readonly #profileDir: string;
	/** Adresse HTTP du protocole de débogage (http://127.0.0.1:port). */
	readonly #endpoint: string;

	private constructor(process: ChildProcess, profileDir: string, endpoint: string) {
		this.#process = process;
		this.#profileDir = profileDir;
		this.#endpoint = endpoint;
	}

	/** Lance Chrome sans interface, avec un profil vierge et temporaire (et `extraArgs` en plus). */
	static async launch(extraArgs: string[] = []): Promise<Browser> {
		const profileDir = mkdtempSync(join(tmpdir(), 'analyseur-q-e2e-'));
		const args = [
			'--headless=new',
			'--remote-debugging-port=0', // port libre, annoncé sur la sortie d'erreur
			`--user-data-dir=${profileDir}`,
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-extensions',
			'--disable-dev-shm-usage',
			...extraArgs,
			'about:blank',
		];
		// Sous Linux (GitHub Actions), le bac à sable de Chrome n'est pas disponible.
		if (process.platform === 'linux') args.push('--no-sandbox');
		const chrome = spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'pipe'] });

		const endpoint = await new Promise<string>((resolve, reject) => {
			let stderr = '';
			const timer = setTimeout(() => reject(new Error(`Chrome n'a pas démarré en 20 s :\n${stderr}`)), 20_000);
			chrome.stderr?.on('data', (chunk: Buffer) => {
				stderr += chunk.toString();
				const match = stderr.match(/DevTools listening on ws:\/\/([^/\s]+)\//);
				if (!match) return;
				clearTimeout(timer);
				resolve(`http://${match[1]}`);
			});
			chrome.once('exit', (code) => {
				clearTimeout(timer);
				reject(new Error(`Chrome s'est arrêté au démarrage (code ${code}) :\n${stderr}`));
			});
		});
		return new Browser(chrome, profileDir, endpoint);
	}

	/** Ouvre un nouvel onglet, avec l'écran d'un téléphone et le toucher activé. */
	async newPage(): Promise<Page> {
		const response = await fetch(`${this.#endpoint}/json/new?about:blank`, { method: 'PUT' });
		const target = (await response.json()) as { id: string; webSocketDebuggerUrl: string };
		const page = await Page.connect(target.webSocketDebuggerUrl, async () => {
			await fetch(`${this.#endpoint}/json/close/${target.id}`).catch(() => {});
		});
		await page.send('Runtime.enable');
		await page.send('Page.enable');
		await page.send('Emulation.setDeviceMetricsOverride', { ...SCREEN, deviceScaleFactor: 3, mobile: true });
		await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
		return page;
	}

	async close(): Promise<void> {
		if (this.#process.exitCode === null) {
			const exited = new Promise((resolve) => this.#process.once('exit', resolve));
			this.#process.kill();
			await exited;
		}
		rmSync(this.#profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	}
}

/* ================= Onglet ================= */

interface CdpMessage {
	id?: number;
	method?: string;
	params?: Record<string, unknown>;
	result?: Record<string, unknown>;
	error?: { message: string };
}

interface RemoteObject {
	value?: unknown;
	description?: string;
}

/** Point de contact d'un doigt, en pixels CSS. */
export interface Point {
	x: number;
	y: number;
}

export class Page {
	/** Erreurs JavaScript de la page (exceptions non rattrapées et console.error). */
	readonly errors: string[] = [];
	readonly #socket: WebSocket;
	readonly #onClose: () => Promise<void>;
	#nextId = 0;
	readonly #pending = new Map<number, { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }>();
	readonly #eventWaiters = new Map<string, (() => void)[]>();

	private constructor(socket: WebSocket, onClose: () => Promise<void>) {
		this.#socket = socket;
		this.#onClose = onClose;
		socket.addEventListener('message', (event) => this.#receive(JSON.parse(String(event.data)) as CdpMessage));
	}

	static async connect(url: string, onClose: () => Promise<void>): Promise<Page> {
		const socket = new WebSocket(url);
		await new Promise((resolve, reject) => {
			socket.addEventListener('open', resolve, { once: true });
			socket.addEventListener('error', () => reject(new Error(`Connexion impossible à ${url}`)), { once: true });
		});
		return new Page(socket, onClose);
	}

	#receive(message: CdpMessage): void {
		if (message.id !== undefined) {
			const pending = this.#pending.get(message.id);
			this.#pending.delete(message.id);
			if (message.error) pending?.reject(new Error(message.error.message));
			else pending?.resolve(message.result ?? {});
			return;
		}
		const params = message.params ?? {};
		if (message.method === 'Runtime.exceptionThrown') {
			const details = params.exceptionDetails as { text: string; exception?: RemoteObject };
			this.errors.push(details.exception?.description ?? details.text);
		} else if (message.method === 'Runtime.consoleAPICalled' && params.type === 'error') {
			const args = params.args as RemoteObject[];
			this.errors.push(args.map((arg) => arg.description ?? String(arg.value)).join(' '));
		}
		for (const resolve of this.#eventWaiters.get(message.method ?? '') ?? []) resolve();
		this.#eventWaiters.delete(message.method ?? '');
	}

	/** Envoie une commande du protocole et renvoie son résultat. */
	send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
		const id = ++this.#nextId;
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#socket.send(JSON.stringify({ id, method, params }));
		});
	}

	/** Promesse résolue au prochain événement `method` du protocole. */
	#nextEvent(method: string): Promise<void> {
		return new Promise((resolve) => {
			this.#eventWaiters.set(method, [...(this.#eventWaiters.get(method) ?? []), resolve]);
		});
	}

	/** Évalue une expression JavaScript dans la page et renvoie sa valeur (promesses attendues). */
	async evaluate<T>(expression: string): Promise<T> {
		const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
		const exception = response.exceptionDetails as { text: string; exception?: RemoteObject } | undefined;
		if (exception) throw new Error(`Évaluation de « ${expression} » : ${exception.exception?.description ?? exception.text}`);
		return (response.result as RemoteObject).value as T;
	}

	/**
	 * Attend que l'expression devienne vraie dans la page (vérifiée toutes les 50 ms).
	 * Échoue au bout de `timeoutMs` en indiquant `what` et la dernière valeur de `show` si fournie.
	 */
	async waitFor(expression: string, what: string, timeoutMs = 5000, show?: string): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (await this.evaluate<boolean>(`Boolean(${expression})`)) return;
			await sleep(50);
		}
		const state = show ? ` (état : ${JSON.stringify(await this.evaluate(show))})` : '';
		throw new Error(`Attente dépassée (${timeoutMs} ms) : ${what}${state}`);
	}

	/** Charge une adresse et attend la fin du chargement. */
	async goto(url: string): Promise<void> {
		const loaded = this.#nextEvent('Page.loadEventFired');
		await this.send('Page.navigate', { url });
		await loaded;
	}

	async reload(): Promise<void> {
		const loaded = this.#nextEvent('Page.loadEventFired');
		await this.send('Page.reload');
		await loaded;
	}

	/* ---------- Toucher ---------- */

	/** Pose des doigts : `points` liste tous les doigts sur l'écran après l'événement. */
	async touchStart(...points: Point[]): Promise<void> {
		await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
	}

	async touchMove(...points: Point[]): Promise<void> {
		await this.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
	}

	/** Lève tous les doigts. */
	async touchEnd(): Promise<void> {
		await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	}

	/** Tap d'un doigt, maintenu `holdMs` ms. */
	async tap(point: Point, holdMs = 60): Promise<void> {
		await this.touchStart(point);
		await sleep(holdMs);
		await this.touchEnd();
	}

	/** Double tap d'un doigt, au rythme d'un vrai doigt. */
	async doubleTap(point: Point): Promise<void> {
		await this.tap(point);
		await sleep(120);
		await this.tap(point);
	}

	async close(): Promise<void> {
		this.#socket.close();
		await this.#onClose();
	}
}
