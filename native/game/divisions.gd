extends Node2D
## Division markers drawn over the map: a small box in the country's colour
## with a strength bar under it. Fighting divisions get an orange frame, cut-off
## ones a red corner. Selected divisions are framed in white and show their
## route. Sizes are in screen pixels, so markers look the same at every zoom.

const WIDTH := 11.0
const HEIGHT := 7.0
const OUTLINE := Color(0.03, 0.03, 0.04)
const SELECTED := Color(1, 1, 1)
const BATTLE := Color(1.0, 0.55, 0.1)
const CUT_OFF := Color(0.9, 0.15, 0.15)
const ROUTE := Color(1, 1, 1, 0.8)
const PENDING := Color(1, 1, 1, 0.45)

## From MwWorld.divisions(), MwWorld.DIVISION_STRIDE numbers per division.
var data := PackedFloat32Array()
## World position of each division id in `data`, filled by `update`.
var positions := {}
var selected := {}
## id -> route as world points, for selected divisions that are moving.
var routes := {}
## id -> world point of an order that applies on the next tick.
var pending := {}
## World units per screen pixel.
var pixel := 1.0
var palette: Image
var to_world: Callable


func update(new_data: PackedFloat32Array) -> void:
	data = new_data
	positions.clear()
	var stride := MwWorld.DIVISION_STRIDE
	for i in range(0, data.size(), stride):
		positions[int(data[i])] = to_world.call(data[i + 2], data[i + 3])
	queue_redraw()


## The division nearest to a world point within `radius` screen pixels, or -1.
func pick(world: Vector2, radius: float) -> int:
	var best := -1
	var best_distance := radius * pixel
	for id in positions:
		var distance: float = world.distance_to(positions[id])
		if distance <= best_distance:
			best = id
			best_distance = distance
	return best


func _draw() -> void:
	var stride := MwWorld.DIVISION_STRIDE
	for id in routes:
		draw_polyline(routes[id], ROUTE, 1.5 * pixel)
	for id in pending:
		if positions.has(id):
			draw_line(positions[id], pending[id], PENDING, 1.5 * pixel)
	var size := Vector2(WIDTH, HEIGHT) * pixel
	for i in range(0, data.size(), stride):
		var id := int(data[i])
		var at: Vector2 = positions[id]
		var flags := int(data[i + 6])
		var box := Rect2(at - size / 2, size)
		var frame := OUTLINE
		if selected.has(id):
			frame = SELECTED
		elif flags & MwWorld.IN_BATTLE:
			frame = BATTLE
		draw_rect(box.grow(1.5 * pixel), frame)
		draw_rect(box, palette.get_pixel(int(data[i + 1]), 0))
		if not flags & MwWorld.SUPPLIED:
			draw_rect(Rect2(box.position, size * 0.4), CUT_OFF)
		# Strength bar: the share of soldiers left.
		var bar := Rect2(box.position + Vector2(0, size.y + 2.0 * pixel), Vector2(size.x, 2.0 * pixel))
		draw_rect(bar.grow(0.75 * pixel), OUTLINE)
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * clampf(data[i + 4], 0, 1), bar.size.y)),
			Color(0.85, 0.9, 0.8))
