import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appSize, portraitRotation, toAppPoint, type Viewport } from '../web/orientation-logic.ts';

const PORTRAIT: Viewport = { width: 390, height: 844, angle: 0, touch: true };
const LEFT: Viewport = { width: 844, height: 390, angle: 90, touch: true };
const RIGHT: Viewport = { width: 844, height: 390, angle: 270, touch: true };

test('portraitRotation : pivote seulement un écran tactile en paysage', () => {
	assert.equal(portraitRotation(PORTRAIT), 0);
	assert.equal(portraitRotation(LEFT), -90);
	assert.equal(portraitRotation(RIGHT), 90);
	assert.equal(portraitRotation({ ...RIGHT, angle: -90 }), 90);
	assert.equal(portraitRotation({ ...LEFT, angle: 0 }), -90, 'angle inconnu : sens par défaut');
	assert.equal(portraitRotation({ ...LEFT, touch: false }), 0, 'ordinateur : jamais');
	assert.equal(portraitRotation({ ...PORTRAIT, angle: 180 }), 0);
});

test('appSize : dimensions portrait une fois pivotée', () => {
	assert.deepEqual(appSize(LEFT, -90), { width: 390, height: 844 });
	assert.deepEqual(appSize(PORTRAIT, 0), { width: 390, height: 844 });
});

test('toAppPoint : les coins de l’écran tombent sur les bons coins de l’app', () => {
	assert.deepEqual(toAppPoint(10, 20, PORTRAIT, 0), { x: 10, y: 20 });
	// -90° : haut de l'app à gauche de l'écran, gauche de l'app en bas.
	assert.deepEqual(toAppPoint(0, 390, LEFT, -90), { x: 0, y: 0 }, 'bas gauche écran = haut gauche app');
	assert.deepEqual(toAppPoint(0, 0, LEFT, -90), { x: 390, y: 0 }, 'haut gauche écran = haut droite app');
	assert.deepEqual(toAppPoint(844, 390, LEFT, -90), { x: 0, y: 844 }, 'bas droite écran = bas gauche app');
	// +90° : haut de l'app à droite de l'écran, gauche de l'app en haut.
	assert.deepEqual(toAppPoint(844, 0, RIGHT, 90), { x: 0, y: 0 }, 'haut droite écran = haut gauche app');
	assert.deepEqual(toAppPoint(844, 390, RIGHT, 90), { x: 390, y: 0 }, 'bas droite écran = haut droite app');
	assert.deepEqual(toAppPoint(0, 0, RIGHT, 90), { x: 0, y: 844 }, 'haut gauche écran = bas gauche app');
});
