extends PanelContainer
## The player's army groups, listed on the left: each row shows the group's
## name and size, the country its front faces, its soldiers against full
## strength, and whether it attacks along an arrow or holds. Clicking a row
## selects the group.

signal group_pressed(group: int)

const Style := preload("res://ui/style.gd")
const WIDTH := 312.0

var scenario: MwScenario
var summary: Label
var rows := VBoxContainer.new()
## Group ids shown, in order, to rebuild only when they change.
var shown: Array = []


func setup() -> void:
	Style.solid(self)
	position = Vector2(16, 76)
	custom_minimum_size.x = WIDTH
	add_theme_stylebox_override("panel", Style.box(Color(Style.PANEL, 0.94), Style.LINE, 8, 16, 16))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	var header := HBoxContainer.new()
	var title := Style.label("Army groups", 20, Style.TEXT, Style.spaced(Style.TITLE, 1))
	title.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(title)
	summary = Style.label("", 13, Style.MUTED)
	summary.size_flags_vertical = SIZE_SHRINK_END
	header.add_child(summary)
	column.add_child(header)
	rows.add_theme_constant_override("separation", 8)
	column.add_child(rows)
	var hint := Style.label("Select divisions on the map, then press G to make them a new group.",
		13, Style.MUTED)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.custom_minimum_size.x = WIDTH - 32 - 24
	var hint_box := PanelContainer.new()
	hint_box.add_theme_stylebox_override("panel", Style.box(Color.TRANSPARENT, Style.LINE_STRONG, 6, 12, 12))
	hint_box.add_child(hint)
	column.add_child(hint_box)
	add_child(column)


## `groups` from MwWorld.groups(), only the player's; `divisions` counts all
## of the player's divisions.
func show_groups(groups: Array, divisions: int, selected: int) -> void:
	summary.text = "%d group%s  ·  %d division%s" % [groups.size(), "" if groups.size() == 1 else "s",
		divisions, "" if divisions == 1 else "s"]
	var ids := groups.map(func(g: Dictionary) -> int: return int(g["id"]))
	if ids != shown:
		shown = ids
		for child in rows.get_children():
			child.queue_free()
		for i in groups.size():
			rows.add_child(_row(int(groups[i]["id"]), i + 1))
	for i in groups.size():
		_fill(rows.get_child(i), groups[i], selected)
	reset_size()


func _row(group: int, number: int) -> PanelContainer:
	var row := PanelContainer.new()
	row.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	row.gui_input.connect(func(event: InputEvent) -> void:
		var click := event as InputEventMouseButton
		if click and click.pressed and click.button_index == MOUSE_BUTTON_LEFT:
			group_pressed.emit(group)
			row.accept_event())
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	column.mouse_filter = MOUSE_FILTER_IGNORE
	var top := HBoxContainer.new()
	top.mouse_filter = MOUSE_FILTER_IGNORE
	var name := Style.label("%s Army Group" % Style.ordinal(number), 19, Style.TEXT, Style.TITLE)
	name.name = "Name"
	name.size_flags_horizontal = SIZE_EXPAND_FILL
	top.add_child(name)
	var size_label := Style.label("", 13, Style.MUTED)
	size_label.name = "Size"
	top.add_child(size_label)
	column.add_child(top)
	var front := Style.label("", 14, Style.CREDIT)
	front.name = "Front"
	column.add_child(front)
	var soldiers := Style.label("", 12, Style.MUTED)
	soldiers.name = "Soldiers"
	column.add_child(soldiers)
	var bar := Bar.new()
	bar.name = "Bar"
	bar.custom_minimum_size = Vector2(0, 6)
	column.add_child(bar)
	var state := HBoxContainer.new()
	state.name = "State"
	state.add_theme_constant_override("separation", 8)
	state.mouse_filter = MOUSE_FILTER_IGNORE
	var icon := Style.LineIcon.new()
	icon.kind = "arrow"
	icon.custom_minimum_size = Vector2(18, 10)
	icon.size_flags_vertical = SIZE_SHRINK_CENTER
	state.add_child(icon)
	state.add_child(Style.label("", 14))
	column.add_child(state)
	row.add_child(column)
	return row


func _fill(row: PanelContainer, group: Dictionary, selected: int) -> void:
	var is_selected := int(group["id"]) == selected
	row.add_theme_stylebox_override("panel", Style.box(Color("161f2c"),
		Style.GOLD if is_selected else Style.LINE, 6, 14, 14))
	var column := row.get_child(0)
	var top := column.get_child(0)
	top.get_node("Name").add_theme_color_override("font_color", Style.GOLD if is_selected else Style.TEXT)
	var count := PackedInt64Array(group["divisions"]).size()
	top.get_node("Size").text = "%d division%s" % [count, "" if count == 1 else "s"]
	var enemy := int(group["enemy"])
	var has_front := PackedVector2Array(group["front"]).size() > 0
	column.get_node("Front").text = ("Front facing " + scenario.country_name(enemy)) if has_front and enemy > 0 \
		else "No front yet"
	var personnel := int(group["personnel"])
	var full := maxi(1, int(group["establishment"]))
	column.get_node("Soldiers").text = "Soldiers %s of %s" % [Style.thousands(personnel), Style.thousands(full)]
	var bar: Bar = column.get_node("Bar")
	bar.share = float(personnel) / full
	bar.queue_redraw()
	var attacking := PackedVector2Array(group["arrow"]).size() > 0
	var state: HBoxContainer = column.get_node("State")
	state.get_child(0).visible = attacking
	var text: Label = state.get_child(1)
	text.text = "Attacking along its arrow" if attacking else (
		"Holding its front" if has_front else "Draw a front for it (F)")
	text.add_theme_color_override("font_color", Style.ARROW if attacking else Style.MUTED)


## A thin bar: the share of full strength.
class Bar extends Control:
	var share := 1.0

	func _init() -> void:
		mouse_filter = MOUSE_FILTER_IGNORE

	func _draw() -> void:
		draw_style_box(Style.box(Style.LINE, Color.TRANSPARENT, 3), Rect2(Vector2.ZERO, size))
		if share > 0.0:
			draw_style_box(Style.box(Color("c9d6c3"), Color.TRANSPARENT, 3),
				Rect2(Vector2.ZERO, Vector2(size.x * clampf(share, 0.0, 1.0), size.y)))
