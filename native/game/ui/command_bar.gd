extends PanelContainer
## The bar at the bottom while divisions are selected: the selection's name
## and the orders for it (draw a front, draw an arrow, hold). While a line is
## being drawn it says how to draw it instead.

signal front_pressed
signal arrow_pressed
signal hold_pressed

const Style := preload("res://ui/style.gd")

var title: Label
var front: PanelContainer
var arrow: PanelContainer
var hold: PanelContainer
var tip: Label


func setup() -> void:
	set_anchors_preset(PRESET_CENTER_BOTTOM)
	grow_horizontal = GROW_DIRECTION_BOTH
	grow_vertical = GROW_DIRECTION_BEGIN
	offset_bottom = -20
	add_theme_stylebox_override("panel", Style.box(Style.PANEL_SOLID, Style.LINE, 8, 8, 8))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	title = Style.label("", 17, Style.GOLD, Style.TITLE)
	title.size_flags_vertical = SIZE_SHRINK_CENTER
	var title_box := MarginContainer.new()
	title_box.add_theme_constant_override("margin_left", 8)
	title_box.add_theme_constant_override("margin_right", 12)
	title_box.add_child(title)
	row.add_child(title_box)
	front = Style.tool_button("Draw front", "F", "front")
	front.pressed.connect(func() -> void: front_pressed.emit())
	row.add_child(front)
	arrow = Style.tool_button("Draw arrow", "R", "arrow")
	arrow.pressed.connect(func() -> void: arrow_pressed.emit())
	row.add_child(arrow)
	hold = Style.tool_button("Hold", "X")
	hold.pressed.connect(func() -> void: hold_pressed.emit())
	row.add_child(hold)
	tip = Style.label("Right-click: order divisions directly", 13, Style.MUTED)
	tip.size_flags_vertical = SIZE_SHRINK_CENTER
	var tip_box := MarginContainer.new()
	tip_box.add_theme_constant_override("margin_left", 6)
	tip_box.add_theme_constant_override("margin_right", 8)
	tip_box.add_child(tip)
	row.add_child(tip_box)
	add_child(row)


## `name` of the selection; `can_hold` when it is a group with an arrow;
## `drawing` is "front", "arrow" or "".
func show_selection(name: String, can_hold: bool, drawing: String) -> void:
	title.text = name
	hold.disabled = not can_hold
	for button in [front, arrow, hold]:
		button.visible = drawing == ""
	match drawing:
		"front":
			tip.text = "Drag along the border with the left mouse button  ·  Esc cancels"
		"arrow":
			tip.text = "Drag from the front into enemy land  ·  Esc cancels"
		_:
			tip.text = "Right-click: order divisions directly"
	reset_size()
