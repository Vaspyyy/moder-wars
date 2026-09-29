export function setCookie(name, value, days = 365) {
	const expires = new Date(Date.now() + days * 864e5).toUTCString();
	// biome-ignore lint/suspicious/noDocumentCookie: cookie helper function
	document.cookie =
		name +
		"=" +
		encodeURIComponent(value) +
		"; expires=" +
		expires +
		"; path=/";
}

export function getCookie(name) {
	return document.cookie.split("; ").reduce((r, v) => {
		const parts = v.split("=");
		return parts[0] === name ? decodeURIComponent(parts[1]) : r;
	}, "");
}
