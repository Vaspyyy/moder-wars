/** Live bindings let independent systems observe replaced state across callbacks. */
export function createLiveContext(readers, writers = {}) {
	const descriptors = {};
	for (const [name, get] of Object.entries(readers)) {
		descriptors[name] = {
			get,
			set: writers[name],
			enumerable: true,
			configurable: true,
		};
	}
	return Object.defineProperties({}, descriptors);
}
