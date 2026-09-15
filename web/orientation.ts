/*
 * Verrou portrait. L'app installée sur Android le demande au système (manifest.json :
 * "orientation": "portrait") ; sur iPhone, une page web ne peut pas verrouiller l'orientation :
 * quand le téléphone passe en paysage, tout l'élément #app pivote pour rester dans l'axe du téléphone.
 *
 * L'app doit :
 * - mettre tout son affichage dans <div id="app"> et inclure styles/_app.scss ;
 * - convertir les coordonnées des touchers avec appPoint() ;
 * - mesurer ses zones avec la taille de ses éléments (clientWidth…), pas celle de la fenêtre ;
 * - importer ce module avant ceux qui mesurent l'écran au démarrage.
 * Calculs : orientation-logic.ts.
 */

import { $ } from './dom.ts';
import { appSize, portraitRotation, toAppPoint, type Rotation, type Viewport } from './orientation-logic.ts';

const app = $('#app');
const coarse = matchMedia('(pointer: coarse)');

let rotation: Rotation = 0;

function viewport(): Viewport {
	const legacy = (window as { orientation?: number }).orientation;
	return {
		width: window.innerWidth,
		height: window.innerHeight,
		angle: screen.orientation?.angle ?? legacy ?? 0,
		touch: coarse.matches,
	};
}

/** Recalcule la rotation. Écouteur enregistré avant ceux des modules importés après celui-ci. */
function update(): void {
	const v = viewport();
	rotation = portraitRotation(v);
	const size = appSize(v, rotation);
	app.dataset.rotation = String(rotation);
	app.style.setProperty('--app-w', `${size.width}px`);
	app.style.setProperty('--app-h', `${size.height}px`);
}

/** Rotation appliquée à #app. */
export const currentRotation = (): Rotation => rotation;

/** Point de l'écran (clientX, clientY) dans le repère de #app, pivotée ou non. */
export function appPoint(clientX: number, clientY: number): { x: number; y: number } {
	return toAppPoint(clientX, clientY, viewport(), rotation);
}

window.addEventListener('resize', update);
screen.orientation?.addEventListener('change', () => {
	update();
	// Certains navigateurs changent l'angle sans redimensionner : les modules qui écoutent resize suivent quand même.
	window.dispatchEvent(new Event('resize'));
});
coarse.addEventListener('change', update);
update();
