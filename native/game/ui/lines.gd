extends RefCounted
## Lines for drawing. A front comes from the simulation cell by cell, so
## where it steps around a pocket it zigzags; for the picture it is
## smoothed (the rules still use the cells).

## Points on each side averaged into each point.
const REACH := 3
## Rounds of corner cutting after the averaging.
const ROUNDS := 2


## A smoothed copy of an open line: each point moves to the average of its
## neighbors (fewer near the ends, and the ends stay put), then corners are
## cut so the line bends smoothly.
static func smooth(line: PackedVector2Array) -> PackedVector2Array:
	if line.size() < 3:
		return line
	var averaged := PackedVector2Array()
	averaged.resize(line.size())
	var last := line.size() - 1
	for i in line.size():
		# A window that fits on both sides, so the ends stay where they are.
		var reach := mini(REACH, mini(i, last - i))
		var sum := Vector2.ZERO
		for j in range(i - reach, i + reach + 1):
			sum += line[j]
		averaged[i] = sum / (2 * reach + 1)
	var result := averaged
	for round in ROUNDS:
		var cut := PackedVector2Array([result[0]])
		for i in result.size() - 1:
			cut.append(result[i].lerp(result[i + 1], 0.25))
			cut.append(result[i].lerp(result[i + 1], 0.75))
		cut.append(result[-1])
		result = cut
	return result
