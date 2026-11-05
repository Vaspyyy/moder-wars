/**
 * Small helpers for building UI with DOM APIs instead of HTML strings, so
 * runtime data (country and city names, flag URLs from imported files) is
 * only ever assigned as text or as a property, never parsed as markup.
 */

/**
 * @typedef {object} ElementOptions
 * @property {string} [className]
 * @property {string} [id]
 * @property {string | number} [text] Assigned with textContent.
 * @property {string} [title]
 * @property {Record<string, string | number | boolean | null | undefined>} [attrs]
 *   Attributes; null, undefined and false are skipped, true sets an empty value.
 * @property {Record<string, string | number>} [dataset]
 * @property {Record<string, string>} [style] Custom properties or genuinely
 *   dynamic values, applied with style.setProperty.
 * @property {Record<string, unknown>} [props] DOM properties such as src,
 *   value or selected.
 */

/** @typedef {Node | string | null | undefined | false} Child */

/**
 * Creates an element.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {ElementOptions} [options]
 * @param {...Child} children Nodes, or strings appended as text.
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, options = {}, ...children) {
	const node = document.createElement(tag);
	if (options.className) node.className = options.className;
	if (options.id) node.id = options.id;
	if (options.title != null) node.title = options.title;
	if (options.attrs) {
		for (const [name, value] of Object.entries(options.attrs)) {
			if (value == null || value === false) continue;
			node.setAttribute(name, value === true ? "" : String(value));
		}
	}
	if (options.dataset) {
		for (const [key, value] of Object.entries(options.dataset)) {
			node.dataset[key] = String(value);
		}
	}
	if (options.style) {
		for (const [name, value] of Object.entries(options.style)) {
			node.style.setProperty(name, value);
		}
	}
	if (options.props) Object.assign(node, options.props);
	if (options.text != null) node.textContent = String(options.text);
	for (const child of children) {
		if (child == null || child === false) continue;
		node.append(child);
	}
	return node;
}
