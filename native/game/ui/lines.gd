extends RefCounted
## Lines for drawing. A front comes from the simulation cell by cell, so
## where it steps around a pocket it zigzags; for the picture it is
## smoothed (the rules still use the cells).

## Points on each side averaged into each point: enough to iron out steps
## of a cell or two, little enough that a real push five points wide keeps
## nearly all of its depth.
const REACH := 2
## Rounds of corner cutting after the averaging.
const ROUNDS := 2
## A step this many times longer than the usual one is a hole in the front
## (land lost where no border was near): the pieces on either side are
## smoothed apart, or the averaging would pull both into the hole.
const GAP := 2.5


## A smoothed copy of an open line, piece by piece between holes. The ends
## of each piece stay where they are, so a hole stays a straight jump.
static func smooth(line: PackedVector2Array) -> PackedVector2Array:
	if line.size() < 3:
		return line
	var steps: Array[float] = []
	for i in line.size() - 1:
		steps.append(line[i].distance_to(line[i + 1]))
	var sorted := steps.duplicate()
	sorted.sort()
	var usual: float = sorted[sorted.size() / 2]
	var result := PackedVector2Array()
	var start := 0
	for i in steps.size() + 1:
		if i == steps.size() or steps[i] > GAP * usual:
			result.append_array(_smooth_piece(line.slice(start, i + 1)))
			start = i + 1
	return result


## Each point moves to the average of its neighbors (fewer near the ends,
## and the ends stay put), then corners are cut so the line bends smoothly.
static func _smooth_piece(line: PackedVector2Array) -> PackedVector2Array:
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
	for _pass in ROUNDS:
		var cut := PackedVector2Array([result[0]])
		for i in result.size() - 1:
			cut.append(result[i].lerp(result[i + 1], 0.25))
			cut.append(result[i].lerp(result[i + 1], 0.75))
		cut.append(result[-1])
		result = cut
	return result
