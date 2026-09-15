/* Accès au DOM. */

/** querySelector qui échoue bruyamment : une erreur de sélecteur se voit dès le chargement. */
export function $<T extends Element = HTMLElement>(selector: string, parent: ParentNode = document): T {
	const element = parent.querySelector<T>(selector);
	if (!element) throw new Error(`Élément introuvable : ${selector}`);
	return element;
}
