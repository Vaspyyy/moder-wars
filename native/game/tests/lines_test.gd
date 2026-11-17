extends "res://tests/harness.gd"
## Smoothing a front for drawing: steps of a cell or two (a front stepping
## around pockets cell by cell) flatten out, a real push keeps its depth,
## the ends stay put, the line stays near the original and in order, a hole
## in the front stays a hole, and a straight line stays straight.

const Lines := preload("res://ui/lines.gd")


## A line along x = 0..19 with y from `height`.
func _line(height: Callable) -> PackedVector2Array:
	var line := PackedVector2Array()
	for x in 20:
		line.append(Vector2(x, height.call(x)))
	return line


## How far y swings over the middle of a line (x from 4 to 16).
func _swing(line: PackedVector2Array) -> float:
	var low := INF
	var high := -INF
	for point in line:
		if point.x >= 4 and point.x <= 16:
			low = minf(low, point.y)
			high = maxf(high, point.y)
	return high - low


## The farthest any point of `line` is from the polyline `original`.
func _drift(line: PackedVector2Array, original: PackedVector2Array) -> float:
	var most := 0.0
	for point in line:
		var nearest := INF
		for i in original.size() - 1:
			var on := Geometry2D.get_closest_point_to_segment(point, original[i], original[i + 1])
			nearest = minf(nearest, point.distance_to(on))
		most = maxf(most, nearest)
	return most


func _in_order(line: PackedVector2Array) -> bool:
	for i in line.size() - 1:
		if line[i + 1].x < line[i].x:
			return false
	return true


func _initialize() -> void:
	# A front stepping up and down a cell every two cells.
	var steps := _line(func(x: int) -> float: return float((x / 2) % 2))
	var smooth: PackedVector2Array = Lines.smooth(steps)
	check(smooth[0] == steps[0] and smooth[-1] == steps[-1], "the ends stay put")
	check(_swing(smooth) < 0.3 * _swing(steps), "steps flatten: %.2f" % _swing(smooth))
	check(smooth.size() == 4 * steps.size(), "two rounds of corner cutting: %d points" % smooth.size())
	check(_drift(smooth, steps) <= 1.0 and _in_order(smooth), "it stays near the front, in order")

	# A real push, five points wide and three deep, its sides traced cell by
	# cell as the front walks around it, keeps nearly all of its depth.
	var push := PackedVector2Array()
	for x in 8:
		push.append(Vector2(x, 0))
	push.append_array(PackedVector2Array([Vector2(8, 1), Vector2(8, 2), Vector2(8, 3), Vector2(9, 3),
		Vector2(10, 3), Vector2(11, 3), Vector2(12, 3), Vector2(12, 2), Vector2(12, 1)]))
	for x in range(13, 20):
		push.append(Vector2(x, 0))
	var pushed: PackedVector2Array = Lines.smooth(push)
	check(_swing(pushed) > 0.95 * 3.0, "a real push keeps its depth: %.2f" % _swing(pushed))

	# A hole in the front: each side is smoothed on its own and the jump
	# between them stays straight.
	var holed := PackedVector2Array()
	for x in 10:
		holed.append(Vector2(x, 0))
	for x in range(25, 35):
		holed.append(Vector2(x, 5))
	var bridged: PackedVector2Array = Lines.smooth(holed)
	var sides_kept := true
	for point in bridged:
		if point.x <= 9.0:
			sides_kept = sides_kept and absf(point.y) < 0.0001
		elif point.x >= 25.0:
			sides_kept = sides_kept and absf(point.y - 5.0) < 0.0001
		else:
			sides_kept = false
	check(sides_kept and bridged.size() == 80, "a hole stays a hole")

	# A straight diagonal line stays on itself, in order from end to end.
	var straight := PackedVector2Array()
	for i in 10:
		straight.append(Vector2(2.0 * i, 1.0 * i))
	var still: PackedVector2Array = Lines.smooth(straight)
	check(_drift(still, straight) < 0.001, "a straight line stays straight")
	check(_in_order(still) and still[0] == straight[0] and still[-1] == straight[-1], "and in order")

	check(Lines.smooth(PackedVector2Array()).is_empty(), "an empty line stays empty")
	check(Lines.smooth(PackedVector2Array([Vector2(1, 1)])).size() == 1, "one point stays one point")
	var two := PackedVector2Array([Vector2(0, 0), Vector2(5, 2)])
	check(Lines.smooth(two) == two, "two points stay as they are")
	finish()
