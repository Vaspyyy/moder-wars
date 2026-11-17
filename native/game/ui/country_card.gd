extends Control
## A card about a country next to the spot that was clicked: a gold ring
## marks the spot and a line joins it to the card, which keeps beside it
## while the map moves. The facts come from MwWorld.country_info; the
## buttons at the bottom are given by the screen that shows it.

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
var body := VBoxContainer.new()


func setup() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	mouse_filter = MOUSE_FILTER_IGNORE
	card.add_theme_stylebox_override("panel", Style.box(
		Color(Style.PANEL, 0.94), Style.LINE_STRONG, 8, 24, 22))
	card.custom_minimum_size.x = CARD_WIDTH
	Style.solid(card)
	card.visible = false
	body.add_theme_constant_override("separation", 18)
	card.add_child(body)
	add_child(card)


## Show the card for a country clicked at a map world position (0 hides
## it). `relation` adds a row about the player ("" for none); `actions` are
## [text, primary?, Callable] for the buttons, and `aside` a short line next
## to them.
func show_country(id: int, world_spot: Vector2, info: Dictionary, relation: String,
		actions: Array, aside: String) -> void:
	country = id
	spot = world_spot
	card.visible = id > 0
	for child in body.get_children():
		body.remove_child(child) # gone now, so the new size is not the old one's
		child.queue_free()
	if id <= 0:
		queue_redraw()
		return
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	var swatch := Style.swatch(palette.get_pixel(id, 0))
	swatch.size_flags_vertical = SIZE_SHRINK_CENTER
	header.add_child(swatch)
	var title := Style.label(scenario.country_name(id), 36, Style.TEXT, Style.TITLE)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(title)
	body.add_child(header)

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
		starts = "%d division%s" % [divisions, "" if divisions == 1 else "s"]
		if relation == "":
			# Before the game starts they still stand where they began.
			starts += " on its borders" if neighbors.size() > 0 else " in its cities"
	var borders := PackedStringArray()
	for neighbor in neighbors.slice(0, MAX_BORDERS):
		borders.append(scenario.country_name(neighbor))
	var border_text := ", ".join(borders) if borders.size() > 0 else "None by land"
	if neighbors.size() > MAX_BORDERS:
		border_text += " and %d more" % (neighbors.size() - MAX_BORDERS)
	var rows := [
		["Population", Style.people(int(info.get("population", 0)))],
		["Economy", "%s a year" % Style.dollars_k(int(info.get("economy_k", 0)))],
		["Active forces", forces],
		["Divisions" if relation != "" else "Starts with", starts],
		["Borders", border_text],
	]
	if relation != "":
		rows.push_front(["Relation", relation])
	for row in rows:
		var key := Style.label(row[0], 16, Style.MUTED)
		key.custom_minimum_size.x = 132
		key.size_flags_vertical = SIZE_SHRINK_BEGIN
		facts.add_child(key)
		var value := Style.label(row[1], 16, Style.WAR if row[0] == "Relation" and row[1].begins_with("At war") else Style.TEXT)
		value.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		value.custom_minimum_size.x = CARD_WIDTH - 48 - 132 - 12
		facts.add_child(value)
	body.add_child(facts)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 16)
	for action in actions:
		var button: Control
		if action[1]:
			button = Style.primary_button(action[0])
			button.custom_minimum_size.y = 48
			button.pressed.connect(action[2])
		else:
			button = Style.tool_button(action[0], "")
			button.pressed.connect(action[2])
		buttons.add_child(button)
	if aside != "":
		var note := Style.label(aside, 14, Style.MUTED)
		note.size_flags_vertical = SIZE_SHRINK_CENTER
		note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		note.size_flags_horizontal = SIZE_EXPAND_FILL
		buttons.add_child(note)
	body.add_child(buttons)
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
