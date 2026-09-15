/*
 * Verrou portrait : sur un téléphone tourné en paysage, l'affichage pivote pour rester dans l'axe
 * du téléphone (iOS ne permet pas à une page web de verrouiller l'orientation).
 * Fonctions pures : testées sous Node (tests/orientation-logic.test.ts).
 */

/** Rotation appliquée à l'app, en degrés : 0 (portrait), -90 ou 90. */
export type Rotation = 0 | -90 | 90;

export interface Viewport {
	/** Taille de la fenêtre, en pixels CSS. */
	width: number;
	height: number;
	/** Angle de l'écran (screen.orientation.angle) : 0, 90, 180 ou 270 (parfois -90). */
	angle: number;
	/** Écran tactile (pointeur grossier) : sur ordinateur, on ne pivote jamais. */
	touch: boolean;
}

/**
 * Rotation qui garde l'affichage en portrait par rapport au téléphone.
 * Téléphone tourné vers la gauche (angle 90) : le haut du téléphone est à gauche de l'écran,
 * l'app pivote de -90°. Vers la droite (angle 270) : +90°.
 */
export function portraitRotation({ width, height, angle, touch }: Viewport): Rotation {
	if (!touch || width <= height) return 0;
	const normalized = ((angle % 360) + 360) % 360;
	return normalized === 270 ? 90 : -90;
}

/** Taille de l'app une fois pivotée : largeur et hauteur échangées en paysage. */
export function appSize(viewport: Viewport, rotation: Rotation): { width: number; height: number } {
	return rotation === 0
		? { width: viewport.width, height: viewport.height }
		: { width: viewport.height, height: viewport.width };
}

/** Point de l'écran (clientX, clientY) exprimé dans le repère de l'app pivotée. */
export function toAppPoint(x: number, y: number, viewport: Viewport, rotation: Rotation): { x: number; y: number } {
	switch (rotation) {
		case 0: return { x, y };
		// Haut de l'app à gauche de l'écran, gauche de l'app en bas de l'écran.
		case -90: return { x: viewport.height - y, y: x };
		// Haut de l'app à droite de l'écran, gauche de l'app en haut de l'écran.
		case 90: return { x: y, y: viewport.width - x };
	}
}
