/*
 * Écran toujours allumé pendant le spectacle, par deux moyens actifs en même temps :
 * - Screen Wake Lock API ;
 * - une vidéo muette invisible jouée en boucle (les navigateurs ne mettent pas l'écran en veille
 *   pendant une lecture vidéo), créée par ce module.
 * La vidéo n'est pas qu'un repli : sur iPhone avant iOS 18.4, dans l'app installée sur l'écran
 * d'accueil, l'API accepte la demande mais ne garde pas l'écran allumé (bug WebKit 254545).
 *
 * Le système relâche le verrou quand l'app passe en arrière-plan : il est redemandé au retour
 * au premier plan, et l'app doit appeler keepScreenAwake() à chaque toucher.
 * La page doit autoriser les médias data: (Content-Security-Policy : media-src 'self' data:).
 */

export interface WakeState {
	/** Screen Wake Lock API active. */
	lock: boolean;
	/** Vidéo muette en lecture. */
	video: boolean;
}

/** Textes à afficher dans les réglages pour un état. */
export function describeWake(state: WakeState): { active: boolean; text: string; detail: string } {
	if (state.lock && state.video) return { active: true, text: 'Écran : verrou actif', detail: 'Screen Wake Lock API + vidéo muette en boucle' };
	if (state.lock) return { active: true, text: 'Écran : verrou actif', detail: 'Screen Wake Lock API' };
	if (state.video) return { active: true, text: 'Écran : verrou actif', detail: 'Vidéo muette en boucle' };
	return { active: false, text: 'Écran : verrou inactif', detail: 'Touchez l\'écran pour le réactiver' };
}

/* ---------- Vidéo muette (1 s, noire, 1 px) ---------- */

const WEBM = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAKCEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEnTbuMU6uEHFO7a1OsggJs7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDBXQYxMYXZmNjEuNy4xMDBEiYhAn0AAAAAAABZUrmvMrgEAAAAAAABD14EBc8WIbmYwf2A4k16cgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4Q7msoA4JSwgQG6gQGagQJTwIEBVbCEVbmBARJUw2dAj3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjEuNy4xMDBzc+pjwItjxYhuZjB/YDiTXmfIkUWjikFMUEhBX01PREVEh4ExZ8ihRaOHRU5DT0RFUkSHlExhdmM2MS4xOS4xMDAgbGlidnB4Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMi4wMDAwMDAwMDAAH0O2dUCq54EAoNuhooEAAAAQAgCdASoBAAEAC8cIhYWImYSIP4IADA1gAP7mtQB1obSmsu6BAaWtcAIAnQEqAQABAAvHCIWFiJmEiD+CAnWqAgy9zgD+6NcfjebzWtb/G83mtWIAoMihmIED6ACxAQAvEfwAGAAwP/QMAAAA/ua1AHWhp6al7oEBpaCxAQAvEfwAGAAwP/QMAMIA/ujXH43m81rW/xvN5rViAPuC/BgcU7trkbuPs4EAt4r3gQHxggG88IED';
const MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMrbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlZ0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHObWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABeW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATlzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAe/+EAFmdCwB7ZHsBEAAADAAQAAAMACDxYuSABAAZoy4BlEyAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAKRAAAAGwAAAAYc3R0cwAAAAAAAAABAAAAAgAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAAABAAAAALAAAAFHN0Y28AAAAAAAAAAQAAA1sAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYxLjcuMTAwAAAACGZyZWUAAAAjbWRhdAAAAAxliIQGc5yYoAAh54AAAAAHQZo4DGc6gA==';

const video = document.createElement('video');
video.id = 'keep-awake';
video.muted = true;
video.loop = true;
video.playsInline = true;
video.preload = 'auto';
video.disablePictureInPicture = true;
video.setAttribute('playsinline', '');
video.setAttribute('webkit-playsinline', '');
video.setAttribute('disableremoteplayback', '');
video.setAttribute('aria-hidden', 'true');
video.tabIndex = -1;
// Invisible mais « affichée » : certains navigateurs ne lisent pas une vidéo masquée.
Object.assign(video.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none' });
for (const [type, src] of [['video/webm', WEBM], ['video/mp4', MP4]]) {
	const source = document.createElement('source');
	source.type = type;
	source.src = src;
	video.append(source);
}
document.body.append(video);

/* ---------- État ---------- */

let sentinel: WakeLockSentinel | null = null;
/** Une demande de verrou est en cours : évite les demandes en double. */
let requesting = false;
const listeners = new Set<(state: WakeState) => void>();

export const wakeState = (): WakeState => ({ lock: Boolean(sentinel && !sentinel.released), video: !video.paused });

function notify(): void {
	const state = wakeState();
	for (const listener of listeners) listener(state);
}

/** Appelle `listener` à chaque changement d'état, et tout de suite avec l'état actuel. */
export function onWakeChange(listener: (state: WakeState) => void): void {
	listeners.add(listener);
	listener(wakeState());
}

function playVideo(): void {
	if (video.paused) video.play().catch(notify);
}

/** Active le maintien de l'écran s'il ne l'est pas déjà. Sans effet si l'app n'est pas visible. */
export async function keepScreenAwake(): Promise<void> {
	if (document.visibilityState !== 'visible' || requesting) return;
	playVideo();
	if (sentinel && !sentinel.released) return;
	if (!('wakeLock' in navigator) || !navigator.wakeLock) return;
	requesting = true;
	try {
		const s = await navigator.wakeLock.request('screen');
		sentinel = s;
		s.addEventListener('release', () => {
			// Ignore la libération d'un ancien verrou déjà remplacé.
			if (sentinel !== s) return;
			sentinel = null;
			notify();
		});
	} catch {
		// Refusé (pas de geste utilisateur, économie d'énergie…) : la vidéo reste seule.
	} finally {
		requesting = false;
		notify();
	}
}

video.addEventListener('pause', notify);
video.addEventListener('playing', notify);
// Certains navigateurs ignorent « loop » sur les médias très courts.
video.addEventListener('timeupdate', () => {
	if (video.duration && video.currentTime > video.duration - 0.4) video.currentTime = 0;
});

// Retour au premier plan : le verrou a pu être relâché.
document.addEventListener('visibilitychange', () => void keepScreenAwake());
window.addEventListener('pageshow', () => void keepScreenAwake());
window.addEventListener('focus', () => void keepScreenAwake());
