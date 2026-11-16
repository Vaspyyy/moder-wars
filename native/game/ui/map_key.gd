extends PanelContainer
## What the marks on the map mean, in the bottom right corner above the data
## credits.

const Style := preload("res://ui/style.gd")


func setup() -> void:
	set_anchors_preset(PRESET_BOTTOM_RIGHT)
	grow_horizontal = GROW_DIRECTION_BEGIN
	grow_vertical = GROW_DIRECTION_BEGIN
	offset_right = -16
	offset_bottom = -56
	mouse_filter = MOUSE_FILTER_IGNORE
	add_theme_stylebox_override("panel", Style.panel(14, 12))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for item in [["front", "Selected group's front"], ["arrow", "Attack arrow"],
			["fighting", "Fighting"], ["cut_off", "Cut off from supply"]]:
		var mark := Mark.new()
		mark.kind = item[0]
		mark.custom_minimum_size = Vector2(26, 12)
		mark.size_flags_vertical = SIZE_SHRINK_CENTER
		grid.add_child(mark)
		grid.add_child(Style.label(item[1], 13, Style.CREDIT))
	add_child(grid)


class Mark extends Control:
	var kind := "front"

	func _draw() -> void:
		var middle := size.y / 2
		match kind:
			"front":
				draw_style_box(Style.box(Style.GOLD, Color.TRANSPARENT, 2), Rect2(0, middle - 2, 22, 4))
			"arrow":
				draw_style_box(Style.box(Style.ARROW, Color.TRANSPARENT, 2), Rect2(0, middle - 2, 22, 4))
			"fighting":
				var box := Rect2(4, middle - 4.5, 14, 9)
				draw_rect(box, Color("6e6e6e"))
				draw_rect(box, Color("ff9a3d"), false, 2.0)
			"cut_off":
				var box := Rect2(4, middle - 4.5, 14, 9)
				draw_rect(box, Color("6e6e6e"))
				draw_rect(box, Color("050709"), false, 2.0)
				draw_rect(Rect2(box.position, Vector2(5, 4)), Style.WAR)
