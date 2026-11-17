extends "res://tests/harness.gd"
## Smoothing a front for drawing: small jags (a front stepping around a
## pocket cell by cell) flatten out, the ends stay put, and a straight line
## stays straight.

const Lines := preload("res://ui/lines.gd")


## The farthest any point is from the straight line y = 0.
func _bulge(line: PackedVector2Array) -> float:
	var most := 0.0
	for point in line:
		most = maxf(most, absf(point.y))
	return most


func _initialize() -> void:
	# A front along y = 0 with a pocket three cells deep in the middle.
	var jagged := PackedVector2Array()
	for x in 20:
		jagged.append(Vector2(x, 3.0 if x >= 9 and x <= 11 else 0.0))
	var smooth: PackedVector2Array = Lines.smooth(jagged)
	check(smooth[0] == jagged[0] and smooth[-1] == jagged[-1], "the ends stay put")
	check(_bulge(smooth) < 0.6 * _bulge(jagged), "the pocket flattens: %.2f" % _bulge(smooth))
	check(smooth.size() >= jagged.size(), "no detail is dropped")
	var straight := PackedVector2Array([Vector2(0, 0), Vector2(5, 0), Vector2(10, 0)])
	check(_bulge(Lines.smooth(straight)) < 0.001, "a straight line stays straight")
	check(Lines.smooth(PackedVector2Array([Vector2(1, 1)])).size() == 1, "one point stays one point")
	finish()
