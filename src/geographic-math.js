/** Normalize a geographic delta once, matching the map's +/-180 boundary. */
export function normalizeLongitudeDelta(delta) {
	if (delta > 180) return delta - 360;
	if (delta < -180) return delta + 360;
	return delta;
}
