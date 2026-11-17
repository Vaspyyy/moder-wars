extends Control
## The main menu, where the game opens: the world dimmed behind three views.
##
## - main: Play, Continue (the newest save, of any scenario or country),
##   Load game and Quit to desktop;
## - play: a card for each scenario (scenarios.gd) and Observer mode, then
##   Pick a country (or Start watching when observer mode is on);
## - load: every save, newest first, each with Load.
##
## Esc goes back one view. The data credit (main's label) stays on top.

signal play_chosen(scenario: String, observe: bool)
signal load_chosen(entry: Dictionary)
signal quit_pressed

const Style := preload("res://ui/style.gd")
const Scenarios := preload("res://scenarios.gd")
const PauseMenu := preload("res://ui/pause_menu.gd")
const LEFT := 120.0
const CARD_GAP := 24.0
const CARD_PICTURE := 250.0
const MENU_WIDTH := 560.0
const LOAD_WIDTH := 720.0
## More saves than this scroll.
const ROWS_SHOWN := 6
const ROW_HEIGHT := 64.0

## "main", "play" or "load".
var view := "main"
## Package name -> {name, date, credit} of each scenario, read from its
## package (main fills it).
var infos := {}
## The scenario selected on the play view, and whether observer mode is on.
var selected := ""
var observe := false
## Every save (SaveSlots.all), newest first.
var saves: Array = []
## Unix seconds now, for "saved 12 minutes ago" (tests replace it).
var now := func() -> float: return Time.get_unix_time_from_system()
var content := Control.new()


func setup() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	Style.solid(self)
	var shade := ColorRect.new()
	shade.color = Color(0.024, 0.039, 0.063, 0.82)
	shade.set_anchors_preset(PRESET_FULL_RECT)
	shade.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(shade)
	content.set_anchors_preset(PRESET_FULL_RECT)
	content.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(content)


func _input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if visible and key and key.pressed and not key.echo and key.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		back()


## Esc: back to the main view (on it, nothing happens).
func back() -> void:
	if view != "main":
		show_main()


func show_main() -> void:
	view = "main"
	_clear()
	var column := VBoxContainer.new()
	column.position = Vector2(LEFT, 140)
	column.add_theme_constant_override("separation", 12)
	column.add_child(Style.label("MODERN WARS", 72, Style.TEXT, Style.spaced(Style.TITLE_BOLD, 10)))
	column.add_child(Style.label("Lead a country on a real map. Every other country is played by the AI.",
		18, Style.MUTED))
	var gap := Control.new()
	gap.custom_minimum_size.y = 36
	column.add_child(gap)
	var buttons := VBoxContainer.new()
	buttons.custom_minimum_size.x = MENU_WIDTH
	buttons.add_theme_constant_override("separation", 12)
	buttons.add_child(_menu_button("Play", "Play", "", "primary", func() -> void: show_play()))
	if not saves.is_empty():
		var newest: Dictionary = saves[0]
		buttons.add_child(_menu_button("Continue", "Continue", describe(newest), "fill",
			func() -> void: load_chosen.emit(newest)))
		buttons.add_child(_menu_button("Load", "Load game", "", "fill", func() -> void: show_load()))
	buttons.add_child(_menu_button("Quit", "Quit to desktop", "", "flat", func() -> void: quit_pressed.emit()))
	column.add_child(buttons)
	content.add_child(column)


func show_play() -> void:
	view = "play"
	_clear()
	if selected == "" or Scenarios.find(selected).is_empty():
		selected = Scenarios.LIST[0]["id"]
	var screen := get_viewport_rect().size
	var count := Scenarios.LIST.size()
	var card_width := minf(668.0, (screen.x - 2 * LEFT - CARD_GAP * (count - 1)) / count)
	var heading := VBoxContainer.new()
	heading.position = Vector2(LEFT, 70)
	heading.add_theme_constant_override("separation", 6)
	heading.add_child(Style.label("PLAY", 13, Style.MUTED, Style.spaced(Style.BODY, 1)))
	heading.add_child(Style.label("Choose a scenario", 44, Style.TEXT, Style.TITLE))
	content.add_child(heading)
	var cards := HBoxContainer.new()
	cards.name = "Cards"
	cards.position = Vector2(LEFT, 170)
	cards.add_theme_constant_override("separation", int(CARD_GAP))
	for entry in Scenarios.LIST:
		cards.add_child(_card(entry, card_width))
	content.add_child(cards)

	var bottom := 170.0 + CARD_PICTURE + 230.0
	# Observer mode: a switch with its name and what it does, all one button.
	var toggle := Button.new()
	toggle.name = "Observer"
	toggle.toggle_mode = true
	toggle.button_pressed = observe
	toggle.focus_mode = FOCUS_NONE
	toggle.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus"]:
		toggle.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	toggle.position = Vector2(LEFT, bottom)
	toggle.toggled.connect(func(on: bool) -> void:
		observe = on
		show_play())
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	row.mouse_filter = MOUSE_FILTER_IGNORE
	var knob := Switch.new()
	knob.on = observe
	knob.custom_minimum_size = Vector2(44, 24)
	knob.size_flags_vertical = SIZE_SHRINK_BEGIN
	knob.mouse_filter = MOUSE_FILTER_IGNORE
	row.add_child(knob)
	var words := VBoxContainer.new()
	words.add_theme_constant_override("separation", 4)
	words.mouse_filter = MOUSE_FILTER_IGNORE
	var title := Style.label("Observer mode", 21, Style.TEXT, Style.TITLE)
	title.mouse_filter = MOUSE_FILTER_IGNORE
	words.add_child(title)
	words.add_child(_wrapped("Watch without leading a country: the AI plays everyone, and every army's "
		+ "arrows are on the map. Off: you pick a country next, and see only your own arrows.", 14,
		Style.MUTED, minf(820.0, screen.x - 2 * LEFT - 420.0)))
	row.add_child(words)
	toggle.add_child(row)
	content.add_child(toggle)
	row.reset_size()
	toggle.custom_minimum_size = row.size

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 12)
	buttons.add_child(_small_button("Back", "Back", "plain", func() -> void: show_main()))
	buttons.add_child(_small_button("Start", "Start watching" if observe else "Pick a country", "primary",
		func() -> void: play_chosen.emit(selected, observe)))
	buttons.set_anchors_preset(PRESET_TOP_RIGHT)
	buttons.grow_horizontal = GROW_DIRECTION_BEGIN
	buttons.position = Vector2(screen.x - LEFT, bottom + 6)
	content.add_child(buttons)
	buttons.reset_size()
	buttons.position.x = screen.x - LEFT - buttons.size.x


func show_load() -> void:
	view = "load"
	_clear()
	var screen := get_viewport_rect().size
	var column := VBoxContainer.new()
	column.position = Vector2(LEFT, 70)
	column.add_theme_constant_override("separation", 6)
	column.add_child(Style.label("LOAD GAME", 13, Style.MUTED, Style.spaced(Style.BODY, 1)))
	column.add_child(Style.label("Your saves", 44, Style.TEXT, Style.TITLE))
	var gap := Control.new()
	gap.custom_minimum_size.y = 18
	column.add_child(gap)
	var rows := VBoxContainer.new()
	rows.name = "Rows"
	rows.add_theme_constant_override("separation", 0)
	for i in saves.size():
		rows.add_child(_save_row(saves[i], i))
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(minf(LOAD_WIDTH, screen.x - 2 * LEFT),
		ROW_HEIGHT * mini(saves.size(), ROWS_SHOWN))
	scroll.add_child(rows)
	rows.size_flags_horizontal = SIZE_EXPAND_FILL
	column.add_child(scroll)
	var space := Control.new()
	space.custom_minimum_size.y = 18
	column.add_child(space)
	var back_button := _small_button("Back", "Back", "plain", func() -> void: show_main())
	back_button.size_flags_horizontal = SIZE_SHRINK_BEGIN
	column.add_child(back_button)
	content.add_child(column)


## "Poland  ·  Modern World 2026  ·  Before the push  ·  25 October 2026,
## 09:00  ·  saved today, 02:40" (the observer's saves say "Observer").
func describe(entry: Dictionary) -> String:
	var parts := PackedStringArray([title_of(entry)])
	if String(entry["name"]) != "Save":
		parts.append(entry["name"])
	if String(entry["time"]) != "":
		parts.append(Style.long_date(String(entry["time"]).get_slice(" ", 0)))
	parts.append(PauseMenu.saved_text(float(entry["saved"]), now.call(), String(entry.get("local", "")),
		Time.get_datetime_string_from_system()))
	return "  ·  ".join(parts)


## "Poland  ·  Modern World 2026".
func title_of(entry: Dictionary) -> String:
	var who := String(entry["country_name"]) if int(entry["country"]) != 0 else "Observer"
	return "%s  ·  %s" % [who, Scenarios.find(entry["scenario"]).get("short", entry["scenario"])]


func _card(entry: Dictionary, width: float) -> Button:
	var id: String = entry["id"]
	var info: Dictionary = infos.get(id, {})
	var chosen := id == selected
	var card := Button.new()
	card.name = "Card-" + id
	card.focus_mode = FOCUS_NONE
	card.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	card.custom_minimum_size = Vector2(width, CARD_PICTURE + 200)
	var line := Style.GOLD if chosen else Style.LINE_STRONG
	var fill := Color("121b27") if chosen else Color("0d131c")
	for state in ["normal", "pressed", "hover"]:
		var box := Style.box(fill if state != "hover" or chosen else Color("111924"), line, 10)
		box.set_border_width_all(2 if chosen else 1)
		card.add_theme_stylebox_override(state, box)
	card.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	card.pressed.connect(func() -> void:
		selected = id
		show_play())
	var column := VBoxContainer.new()
	column.set_anchors_preset(PRESET_FULL_RECT)
	column.offset_left = 2
	column.offset_right = -2
	column.offset_top = 2
	column.add_theme_constant_override("separation", 0)
	column.mouse_filter = MOUSE_FILTER_IGNORE
	var picture := TextureRect.new()
	picture.texture = load(entry["preview"])
	picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	picture.custom_minimum_size = Vector2(width - 4, CARD_PICTURE)
	picture.mouse_filter = MOUSE_FILTER_IGNORE
	column.add_child(picture)
	var text := VBoxContainer.new()
	text.add_theme_constant_override("separation", 10)
	text.mouse_filter = MOUSE_FILTER_IGNORE
	var margin := MarginContainer.new()
	for side in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 22)
	margin.add_theme_constant_override("margin_top", 18)
	margin.mouse_filter = MOUSE_FILTER_IGNORE
	margin.add_child(text)
	column.add_child(margin)
	var top := HBoxContainer.new()
	top.mouse_filter = MOUSE_FILTER_IGNORE
	var name := Style.label(info.get("name", id), 30, Style.TEXT, Style.TITLE)
	name.size_flags_horizontal = SIZE_EXPAND_FILL
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	top.add_child(name)
	var tag: String = entry["tag"]
	var at_war := tag != ""
	var badge := Style.label(tag if at_war else "At peace", 12, Style.WAR if at_war else Style.MUTED)
	badge.add_theme_stylebox_override("normal", Style.box(Color.TRANSPARENT,
		Style.WAR_LINE if at_war else Style.LINE_STRONG, 3, 7, 2))
	badge.size_flags_vertical = SIZE_SHRINK_CENTER
	top.add_child(badge)
	text.add_child(top)
	var where := PackedStringArray()
	if String(info.get("date", "")) != "":
		where.append("Starts " + Style.long_date(info["date"]))
	where.append(entry["where"])
	text.add_child(_wrapped("  ·  ".join(where), 15, Style.MUTED, width - 48))
	text.add_child(_wrapped(entry["blurb"], 15, Style.CREDIT, width - 48))
	# License requirement: each scenario's data credit stays visible.
	var credit := _wrapped(info.get("credit", ""), 12, Style.MUTED, width - 48)
	credit.name = "Credit"
	text.add_child(credit)
	card.add_child(column)
	return card


func _save_row(entry: Dictionary, index: int) -> PanelContainer:
	var row := PanelContainer.new()
	row.name = "Save%d" % index
	var style := StyleBoxFlat.new()
	style.bg_color = Color.TRANSPARENT
	style.border_color = Style.LINE
	style.border_width_top = 1
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	row.add_theme_stylebox_override("panel", style)
	row.custom_minimum_size.y = ROW_HEIGHT
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 16)
	var texts := VBoxContainer.new()
	texts.add_theme_constant_override("separation", 2)
	texts.size_flags_horizontal = SIZE_EXPAND_FILL
	var title := Style.label(title_of(entry) + ("  ·  " + String(entry["name"])
		if String(entry["name"]) != "Save" else ""), 17, Style.TEXT, Style.BODY_MEDIUM)
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	texts.add_child(title)
	var parts := PackedStringArray()
	if String(entry["time"]) != "":
		parts.append(Style.long_date(String(entry["time"]).get_slice(" ", 0)) + " in the game")
	parts.append(PauseMenu.saved_text(float(entry["saved"]), now.call(), String(entry.get("local", "")),
		Time.get_datetime_string_from_system()))
	texts.add_child(Style.label("  ·  ".join(parts), 13, Style.MUTED))
	line.add_child(texts)
	line.add_child(_small_button("Load", "Load", "fill", func() -> void: load_chosen.emit(entry)))
	row.add_child(line)
	return row


func _clear() -> void:
	for child in content.get_children():
		content.remove_child(child)
		child.queue_free()


func _wrapped(text: String, size: int, color: Color, width: float) -> Label:
	var label := Style.label(text, size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size.x = width
	label.mouse_filter = MOUSE_FILTER_IGNORE
	return label


## A full-width button: a title and an optional line under it. `kind`:
## "primary" (gold), "fill" (dark) or "flat" (no box until hovered).
func _menu_button(id: String, title: String, sub: String, kind: String, action: Callable) -> Button:
	var button := _styled(Button.new(), kind)
	button.name = id
	button.custom_minimum_size.y = 64 if kind == "primary" or sub != "" else 56
	var texts := VBoxContainer.new()
	texts.set_anchors_preset(PRESET_FULL_RECT)
	texts.offset_left = 24
	texts.offset_right = -24
	texts.alignment = BoxContainer.ALIGNMENT_CENTER
	texts.add_theme_constant_override("separation", 2)
	texts.mouse_filter = MOUSE_FILTER_IGNORE
	var ink := Style.ON_GOLD if kind == "primary" else (Style.MUTED if kind == "flat" else Style.TEXT)
	texts.add_child(Style.label(title, 26 if kind == "primary" else 22, ink,
		Style.TITLE_BOLD if kind == "primary" else Style.TITLE))
	if sub != "":
		var line := Style.label(sub, 13, Style.MUTED)
		line.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		texts.add_child(line)
	button.add_child(texts)
	button.pressed.connect(action)
	return button


func _small_button(id: String, text: String, kind: String, action: Callable) -> Button:
	var button := _styled(Button.new(), kind)
	button.name = id
	button.text = text
	button.custom_minimum_size.y = 52 if kind == "primary" or id == "Back" else 40
	button.size_flags_vertical = SIZE_SHRINK_CENTER
	button.pressed.connect(action)
	return button


## An on/off switch: a pill, gold with the knob on the right when on.
class Switch extends Control:
	var on := false

	func _draw() -> void:
		var radius := size.y / 2.0
		var fill := Style.GOLD if on else Style.BUTTON_HOVER
		draw_circle(Vector2(radius, radius), radius, fill)
		draw_circle(Vector2(size.x - radius, radius), radius, fill)
		draw_rect(Rect2(radius, 0, size.x - 2 * radius, size.y), fill)
		var knob := Vector2(size.x - radius if on else radius, radius)
		draw_circle(knob, radius - 3.0, Style.ON_GOLD if on else Style.MUTED)


func _styled(button: Button, kind: String) -> Button:
	var fill := Color(0.086, 0.122, 0.173, 0.92)
	var line := Style.LINE_STRONG
	var hover := Style.BUTTON_HOVER
	var ink := Style.TEXT
	var font: Font = Style.TITLE
	match kind:
		"primary":
			fill = Style.GOLD
			line = Color.TRANSPARENT
			hover = Style.GOLD_HOVER
			ink = Style.ON_GOLD
			font = Style.TITLE_BOLD
		"plain":
			fill = Color.TRANSPARENT
		"flat":
			fill = Color.TRANSPARENT
			line = Color.TRANSPARENT
	button.add_theme_stylebox_override("normal", Style.box(fill, line, 8, 24, 0))
	button.add_theme_stylebox_override("hover", Style.box(hover, line, 8, 24, 0))
	button.add_theme_stylebox_override("pressed", Style.box(hover.darkened(0.08), line, 8, 24, 0))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	button.add_theme_font_override("font", font)
	button.add_theme_font_size_override("font_size", 20)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state, ink)
	button.focus_mode = FOCUS_NONE
	button.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	return button
