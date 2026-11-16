extends Node2D
## Division markers and army group lines drawn over the map.
##
## A division is a small box in its country's colour with a strength bar
## under it, and a number when several stand together. Fighting divisions
## get an orange frame, cut-off ones a red corner. Selected divisions are framed in white and show their route.
## An army group's front is a thick line in its country's colour (white when
## the group is selected, gold); its arrow is drawn in orange with a head at
## the tip. Sizes are in screen pixels, so everything looks the same at any zoom.

const WIDTH := 11.0
const HEIGHT := 7.0
const OUTLINE := Color(0.03, 0.03, 0.04)
const SELECTED := Color(1, 1, 1)
const BATTLE := Color(1.0, 0.55, 0.1)
const CUT_OFF := Color(0.9, 0.15, 0.15)
const ROUTE := Color(1, 1, 1, 0.8)
const ARROW := Color(1.0, 0.45, 0.15, 0.9)
const STROKE := Color(1, 1, 1, 0.7)
const SELECTED_FRONT := Color(1.0, 0.82, 0.25)

## From MwWorld.divisions(), MwWorld.DIVISION_STRIDE numbers per division.
var data := PackedFloat32Array()
## World position and country of each division id in `data`, filled by
## `update`.
var positions := {}
var countries := {}
var selected := {}
## id -> route as world points, for selected divisions that are moving.
var routes := {}
## From MwWorld.groups(), with `front` and `arrow` turned into world points.
var groups: Array = []
var selected_group := 0
## The line being drawn (world points), and whether it is an arrow.
var stroke := PackedVector2Array()
var stroke_is_arrow := false
## World units per screen pixel.
var pixel := 1.0
var palette: Image
var to_world: Callable


func update(new_data: PackedFloat32Array) -> void:
	data = new_data
	positions.clear()
	countries.clear()
	var stride := MwWorld.DIVISION_STRIDE
	for i in range(0, data.size(), stride):
		positions[int(data[i])] = to_world.call(data[i + 2], data[i + 3])
		countries[int(data[i])] = int(data[i + 1])
	queue_redraw()


## The division nearest to a world point within `radius` screen pixels, or
## -1; only `country`'s divisions unless it is 0.
func pick(world: Vector2, radius: float, country := 0) -> int:
	var best := -1
	var best_distance := radius * pixel
	for id in positions:
		if country != 0 and countries[id] != country:
			continue
		var distance: float = world.distance_to(positions[id])
		if distance <= best_distance:
			best = id
			best_distance = distance
	return best


## The id of the army group a division belongs to, or 0.
func group_of(division: int) -> int:
	for group in groups:
		if PackedInt64Array(group["divisions"]).has(division):
			return group["id"]
	return 0


func _draw() -> void:
	for group in groups:
		_draw_front(group)
	for group in groups:
		if group["arrow"].size() > 0:
			_draw_arrow(group["arrow"], ARROW)
	for id in routes:
		draw_polyline(routes[id], ROUTE, 1.5 * pixel)
	_draw_markers()
	if stroke.size() > 1:
		if stroke_is_arrow:
			_draw_arrow(stroke, STROKE)
		else:
			draw_polyline(stroke, STROKE, 3.0 * pixel)


func _draw_front(group: Dictionary) -> void:
	var line: PackedVector2Array = group["front"]
	if line.size() == 0:
		return
	var color := palette.get_pixel(int(group["country"]), 0).lightened(0.3)
	if int(group["id"]) == selected_group:
		color = SELECTED_FRONT
	if line.size() == 1:
		draw_circle(line[0], 3.0 * pixel, color)
		return
	draw_polyline(line, OUTLINE, 5.0 * pixel)
	draw_polyline(line, color, 3.0 * pixel)


func _draw_arrow(line: PackedVector2Array, color: Color) -> void:
	if line.size() < 2:
		return
	var tip := line[line.size() - 1]
	var back := (line[line.size() - 2] - tip).normalized()
	var head := 14.0 * pixel
	var side := back.orthogonal() * head * 0.6
	var shaft := line.duplicate()
	shaft[shaft.size() - 1] = tip + back * head * 0.8
	draw_polyline(shaft, OUTLINE, 7.0 * pixel)
	draw_polyline(shaft, color, 4.0 * pixel)
	var points := PackedVector2Array([tip, tip + back * head + side, tip + back * head - side])
	draw_colored_polygon(points, OUTLINE)
	var inner := PackedVector2Array([
		tip + back * 2.0 * pixel,
		tip + back * (head - 1.5 * pixel) + side * 0.8,
		tip + back * (head - 1.5 * pixel) - side * 0.8])
	draw_colored_polygon(inner, color)


func _draw_markers() -> void:
	var stride := MwWorld.DIVISION_STRIDE
	var size := Vector2(WIDTH, HEIGHT) * pixel
	# Divisions standing together are drawn once, with how many there are.
	var stacks := {}
	for id in positions:
		var at: Vector2 = positions[id]
		stacks[at] = stacks.get(at, 0) + 1
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
		var count: int = stacks.get(at, 1)
		if count > 1:
			stacks[at] = 1 # label each stack once
			var font := ThemeDB.fallback_font
			var text_at := at + Vector2(size.x / 2 + 2.0 * pixel, size.y / 2)
			draw_set_transform(text_at, 0.0, Vector2(pixel, pixel))
			draw_string_outline(font, Vector2.ZERO, str(count), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, 4, OUTLINE)
			draw_string(font, Vector2.ZERO, str(count), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, SELECTED)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
