extends PanelContainer
## The bar along the top while the player leads a country: the country,
## whether it is at war and its faction on the left, the date with the
## pause button and the five speeds in the middle, and income, people left
## to draft, divisions and war support on the right.

signal pause_pressed
signal speed_pressed(speed: int)
## Income or people left to draft was clicked: open the economy window.
signal economy_pressed
## The faction button was clicked: open the faction window.
signal faction_pressed

const Style := preload("res://ui/style.gd")

var scenario: MwScenario
var palette: Image
var swatch: Panel
var country_name: Label
var status: Label
var status_box: PanelContainer
var date: Label
var hour: Label
var speed := SpeedControl.new()
var values := {}
## The faction's name, a button (hidden in no faction).
var faction: Button


func setup() -> void:
	Style.solid(self)
	set_anchors_preset(PRESET_TOP_WIDE)
	custom_minimum_size.y = 60
	var style := Style.box(Style.PANEL_SOLID, Color.TRANSPARENT, 0, 20, 0)
	style.border_color = Style.LINE
	style.border_width_bottom = 1
	add_theme_stylebox_override("panel", style)

	var row := HBoxContainer.new()
	add_child(row)
	var left := HBoxContainer.new()
	left.add_theme_constant_override("separation", 14)
	left.size_flags_horizontal = SIZE_EXPAND_FILL
	swatch = Style.swatch(Color.GRAY)
	swatch.size_flags_vertical = SIZE_SHRINK_CENTER
	left.add_child(swatch)
	country_name = Style.label("", 24, Style.TEXT, Style.TITLE)
	country_name.size_flags_vertical = SIZE_SHRINK_CENTER
	left.add_child(country_name)
	status_box = PanelContainer.new()
	status_box.size_flags_vertical = SIZE_SHRINK_CENTER
	status = Style.label("", 14)
	status_box.add_child(status)
	left.add_child(status_box)
	faction = Button.new()
	faction.name = "Faction"
	faction.focus_mode = FOCUS_NONE
	faction.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	faction.size_flags_vertical = SIZE_SHRINK_CENTER
	faction.tooltip_text = "Your faction"
	faction.add_theme_font_override("font", Style.BODY_STRONG)
	faction.add_theme_font_size_override("font_size", 14)
	for state in ["normal", "hover", "pressed"]:
		faction.add_theme_color_override("font_%s_color" % state if state != "normal" else "font_color",
			Style.GOLD)
		faction.add_theme_stylebox_override(state, Style.box(
			Style.BUTTON_HOVER if state == "hover" else Color.TRANSPARENT, Style.GOLD, 4, 10, 4))
	faction.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	faction.pressed.connect(func() -> void: faction_pressed.emit())
	faction.visible = false
	left.add_child(faction)
	row.add_child(left)

	var middle := HBoxContainer.new()
	middle.add_theme_constant_override("separation", 16)
	var when := VBoxContainer.new()
	when.alignment = BoxContainer.ALIGNMENT_CENTER
	when.add_theme_constant_override("separation", -2)
	date = Style.label("", 20, Style.TEXT, Style.TITLE)
	date.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	when.add_child(date)
	hour = Style.label("", 13, Style.MUTED)
	hour.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	when.add_child(hour)
	middle.add_child(when)
	var speed_box := PanelContainer.new()
	speed_box.add_theme_stylebox_override("panel", Style.box(Color.TRANSPARENT, Style.LINE, 6, 4, 4))
	speed_box.size_flags_vertical = SIZE_SHRINK_CENTER
	speed.custom_minimum_size = Vector2(44 + 6 + 5 * 16 + 4, 36)
	speed.pause_pressed.connect(func() -> void: pause_pressed.emit())
	speed.speed_pressed.connect(func(value: int) -> void: speed_pressed.emit(value))
	speed_box.add_child(speed)
	middle.add_child(speed_box)
	row.add_child(middle)

	var right := HBoxContainer.new()
	right.add_theme_constant_override("separation", 28)
	right.alignment = BoxContainer.ALIGNMENT_END
	right.size_flags_horizontal = SIZE_EXPAND_FILL
	for key in ["Income", "Can draft", "Divisions", "War support"]:
		var stat := VBoxContainer.new()
		stat.alignment = BoxContainer.ALIGNMENT_CENTER
		stat.add_theme_constant_override("separation", -1)
		stat.mouse_filter = MOUSE_FILTER_IGNORE
		var caption := Style.label(key, 12, Style.MUTED)
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		stat.add_child(caption)
		var value := Style.label("", 20, Style.TEXT, Style.TITLE)
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		stat.add_child(value)
		values[key] = value
		if key == "Income" or key == "Can draft":
			# These two open the economy window.
			var button := Style.ToolButton.new()
			button.flat = true
			button.padding = Vector2(8, 4)
			button.custom_minimum_size.y = 0
			button.size_flags_vertical = SIZE_SHRINK_CENTER
			button.tooltip_text = "Budget and mobilization (B)"
			button.pressed.connect(func() -> void: economy_pressed.emit())
			button.add_child(stat)
			right.add_child(button)
		else:
			right.add_child(stat)
	row.add_child(right)


## Show the player's country now: `economy` from MwWorld.economy, `time`
## from MwWorld.time_text ("2026-10-25 14:00").
func show_state(country: int, economy: Dictionary, enemies: PackedInt32Array,
		divisions: int, time: String, paused: bool, speed_now: int) -> void:
	swatch.add_theme_stylebox_override("panel", Style.box(palette.get_pixel(country, 0), Color(0, 0, 0, 0.6), 3))
	country_name.text = scenario.country_name(country)
	var at_war := enemies.size() > 0
	if at_war:
		var names := PackedStringArray()
		for enemy in enemies:
			names.append(scenario.country_name(enemy))
		status.text = "At war with " + (Style.list_and(names) if names.size() <= 2
			else "%d countries" % names.size())
	else:
		status.text = "At peace"
	status.add_theme_color_override("font_color", Style.WAR if at_war else Style.MUTED)
	status_box.add_theme_stylebox_override("panel", Style.box(
		Color.TRANSPARENT, Style.WAR_LINE if at_war else Style.LINE, 4, 10, 4))
	var parts := time.split(" ")
	date.text = Style.long_date(parts[0])
	hour.text = parts[1] if parts.size() > 1 else ""
	speed.paused = paused
	speed.speed = speed_now
	speed.queue_redraw()
	if economy.is_empty():
		return
	values["Income"].text = "$%.2f bn a day" % (float(economy["income_k"]) / 1e6)
	values["Can draft"].text = Style.thousands(int(economy["manpower"]))
	values["Divisions"].text = str(divisions)
	values["War support"].text = "%d%%" % roundi(int(economy["support"]) / 10.0)


## The faction button: its name, or hidden for "" (no faction).
func show_faction(name: String) -> void:
	faction.text = name
	faction.visible = name != ""


## The pause button and five speed bars; the bars up to the current speed
## are gold. Paused, the button shows a gold play sign.
class SpeedControl extends Control:
	signal pause_pressed
	signal speed_pressed(speed: int)

	const BUTTON_WIDTH := 44.0
	const PIP_WIDTH := 16.0

	var paused := true
	var speed := 1

	func _init() -> void:
		mouse_default_cursor_shape = CURSOR_POINTING_HAND

	func _gui_input(event: InputEvent) -> void:
		var click := event as InputEventMouseButton
		if click == null or not click.pressed or click.button_index != MOUSE_BUTTON_LEFT:
			return
		if click.position.x < BUTTON_WIDTH:
			pause_pressed.emit()
		else:
			var pip := int((click.position.x - BUTTON_WIDTH - 6) / PIP_WIDTH)
			speed_pressed.emit(clampi(pip + 1, 1, 5))
		accept_event()

	func _draw() -> void:
		var button := Rect2(0, 0, BUTTON_WIDTH, size.y)
		draw_style_box(Style.box(Style.BUTTON, Color.TRANSPARENT, 4), button)
		var c := button.get_center()
		if paused:
			draw_colored_polygon(PackedVector2Array([c + Vector2(-4, -7), c + Vector2(7, 0),
				c + Vector2(-4, 7)]), Style.GOLD)
		else:
			draw_rect(Rect2(c + Vector2(-5, -6), Vector2(3.5, 12)), Style.TEXT)
			draw_rect(Rect2(c + Vector2(1.5, -6), Vector2(3.5, 12)), Style.TEXT)
		for i in 5:
			var x := BUTTON_WIDTH + 6 + i * PIP_WIDTH + (PIP_WIDTH - 8) / 2
			var bar := Rect2(x, (size.y - 20) / 2, 8, 20)
			draw_style_box(Style.box(Style.GOLD if i < speed else Style.OFF, Color.TRANSPARENT, 2), bar)
