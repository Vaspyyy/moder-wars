extends Control
## The first screen: the world, paused, and a card about the country the
## player clicked, with a button to lead it. A gold ring marks the clicked
## spot and a line joins it to the card, which keeps beside it while the map
## moves.

signal lead_pressed(country: int)

const Style := preload("res://ui/style.gd")
const CARD_WIDTH := 400.0
## Gap between the clicked spot and the card.
const CARD_GAP := 96.0
const MAX_BORDERS := 8

var scenario: MwScenario
var palette: Image
## Map world position -> screen position.
var to_screen: Callable
var country := 0
var spot := Vector2.ZERO
var card := PanelContainer.new()
var card_body := VBoxContainer.new()


func setup(start_date: String) -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	mouse_filter = MOUSE_FILTER_IGNORE

	var title := PanelContainer.new()
	title.add_theme_stylebox_override("panel", Style.panel(18, 14))
	title.position = Vector2(24, 20)
	var title_lines := VBoxContainer.new()
	title_lines.add_theme_constant_override("separation", 4)
	title_lines.add_child(Style.label("MODERN WARS", 22, Style.TEXT, Style.spaced(Style.TITLE_BOLD, 3)))
	var subtitle := scenario.scenario_name()
	if start_date != "":
		subtitle += "  ·  starts " + Style.long_date(start_date)
	title_lines.add_child(Style.label(subtitle, 14, Style.MUTED))
	title.add_child(title_lines)
	add_child(title)

	var paused := PanelContainer.new()
	paused.add_theme_stylebox_override("panel", Style.panel(16, 10))
	paused.set_anchors_preset(PRESET_TOP_RIGHT)
	paused.grow_horizontal = GROW_DIRECTION_BEGIN
	paused.position = Vector2(-24, 20)
	var paused_row := HBoxContainer.new()
	paused_row.add_theme_constant_override("separation", 10)
	var icon := PauseIcon.new()
	icon.custom_minimum_size = Vector2(14, 14)
	icon.size_flags_vertical = SIZE_SHRINK_CENTER
	paused_row.add_child(icon)
	paused_row.add_child(Style.label("PAUSED", 18, Style.TEXT, Style.spaced(Style.TITLE, 1)))
	paused.add_child(paused_row)
	add_child(paused)

	var hint := PanelContainer.new()
	hint.add_theme_stylebox_override("panel", Style.panel(16, 12))
	hint.set_anchors_preset(PRESET_BOTTOM_LEFT)
	hint.grow_vertical = GROW_DIRECTION_BEGIN
	hint.position = Vector2(24, -20)
	var hint_lines := VBoxContainer.new()
	hint_lines.add_theme_constant_override("separation", 4)
	hint_lines.add_child(Style.label(
		"Click any country to lead it. The game starts paused, so you can plan first.", 15))
	hint_lines.add_child(Style.label(
		"Every other country is played by the AI, with the same orders you have.", 13, Style.MUTED))
	hint.add_child(hint_lines)
	add_child(hint)

	card.add_theme_stylebox_override("panel", Style.box(
		Color(Style.PANEL, 0.94), Style.LINE_STRONG, 8, 24, 22))
	card.custom_minimum_size.x = CARD_WIDTH
	card.visible = false
	card_body.add_theme_constant_override("separation", 18)
	card.add_child(card_body)
	add_child(card)


## Show the card for a country clicked at a map world position (0 hides it).
func show_country(id: int, world_spot: Vector2, info: Dictionary) -> void:
	country = id
	spot = world_spot
	card.visible = id > 0
	for child in card_body.get_children():
		child.queue_free()
	if id <= 0:
		queue_redraw()
		return
	var name := scenario.country_name(id)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	var swatch := Style.swatch(palette.get_pixel(id, 0))
	swatch.size_flags_vertical = SIZE_SHRINK_CENTER
	header.add_child(swatch)
	var title := Style.label(name, 36, Style.TEXT, Style.TITLE)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(title)
	card_body.add_child(header)

	var facts := GridContainer.new()
	facts.columns = 2
	facts.add_theme_constant_override("h_separation", 12)
	facts.add_theme_constant_override("v_separation", 10)
	var neighbors := PackedInt32Array(info.get("neighbors", []))
	var divisions := int(info.get("divisions", 0))
	var personnel := int(info.get("personnel", 0))
	var forces := "Unknown"
	if personnel > 0:
		forces = "%s (%d)" % [Style.thousands(personnel), int(info["personnel_year"])]
	var starts := "no divisions"
	if divisions > 0:
		starts = "%d division%s %s" % [divisions, "" if divisions == 1 else "s",
			"on its borders" if neighbors.size() > 0 else "in its cities"]
	var borders := PackedStringArray()
	for neighbor in neighbors.slice(0, MAX_BORDERS):
		borders.append(scenario.country_name(neighbor))
	var border_text := ", ".join(borders) if borders.size() > 0 else "None by land"
	if neighbors.size() > MAX_BORDERS:
		border_text += " and %d more" % (neighbors.size() - MAX_BORDERS)
	for row in [
		["Population", Style.people(int(info.get("population", 0)))],
		["Economy", "%s a year" % Style.dollars_k(int(info.get("economy_k", 0)))],
		["Active forces", forces],
		["Starts with", starts],
		["Borders", border_text],
	]:
		var key := Style.label(row[0], 16, Style.MUTED)
		key.custom_minimum_size.x = 132
		key.size_flags_vertical = SIZE_SHRINK_BEGIN
		facts.add_child(key)
		var value := Style.label(row[1], 16)
		value.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		value.custom_minimum_size.x = CARD_WIDTH - 48 - 132 - 12
		facts.add_child(value)
	card_body.add_child(facts)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 16)
	var lead := Style.primary_button("Lead " + name)
	lead.custom_minimum_size.y = 48
	lead.pressed.connect(func() -> void: lead_pressed.emit(country))
	actions.add_child(lead)
	var other := Style.label("or click another country", 14, Style.MUTED)
	other.size_flags_vertical = SIZE_SHRINK_CENTER
	other.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	other.size_flags_horizontal = SIZE_EXPAND_FILL
	actions.add_child(other)
	card_body.add_child(actions)
	card.reset_size()
	_place_card()


func _process(_delta: float) -> void:
	if card.visible:
		_place_card()


## Beside the spot, on whichever side has room, within the screen.
func _place_card() -> void:
	var screen := get_viewport_rect().size
	var at: Vector2 = to_screen.call(spot)
	var card_size := card.get_combined_minimum_size()
	var x := at.x + CARD_GAP
	if x + card_size.x > screen.x - 24:
		x = at.x - CARD_GAP - card_size.x
	x = clampf(x, 24, maxf(24, screen.x - 24 - card_size.x))
	var y := clampf(at.y - card_size.y * 0.5, 96, maxf(96, screen.y - 72 - card_size.y))
	card.position = Vector2(x, y)
	card.size = card_size
	queue_redraw()


func _draw() -> void:
	if not card.visible:
		return
	var at: Vector2 = to_screen.call(spot)
	var rect := card.get_rect()
	var edge := rect.position.x if rect.position.x > at.x else rect.end.x
	var y := clampf(at.y, rect.position.y + 16, rect.end.y - 16)
	draw_line(at, Vector2(edge, y), Style.GOLD, 1.0, true)
	draw_circle(at, 6.5, Color("0e1826"))
	draw_circle(at, 5.5, Style.GOLD, false, 2.0, true)


## Two gold bars.
class PauseIcon extends Control:
	func _draw() -> void:
		var bar := Vector2(size.x * 0.25, size.y * 0.86)
		var top := size.y * 0.07
		draw_rect(Rect2(Vector2(size.x * 0.14, top), bar), Style.GOLD)
		draw_rect(Rect2(Vector2(size.x * 0.61, top), bar), Style.GOLD)
