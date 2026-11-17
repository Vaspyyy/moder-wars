extends Control
## The end of a lost war: when the country you lead capitulates, this
## screen says what the war cost (days at war, divisions raised, soldiers
## lost on both sides, land kept, regions handed over) and offers New game,
## Load your save, or Watch the world go on. The game stays paused while it
## is open; Esc watches.

signal watch_pressed
signal load_pressed
signal new_game_pressed

const Style := preload("res://ui/style.gd")
const WIDTH := 660.0
## Regions named per line before "and 12 more".
const MAX_NAMES := 8
## Countries given a line of their own before "and to 3 more countries".
const MAX_RECEIVERS := 4

var scenario: MwScenario
var palette: Image
## A red box with the dark one inside, three pixels lower: a red top edge.
var dialog := PanelContainer.new()
var inner := PanelContainer.new()


func setup() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	Style.solid(self)
	var shade := ColorRect.new()
	shade.color = Color(0.024, 0.039, 0.063, 0.8)
	shade.set_anchors_preset(PRESET_FULL_RECT)
	shade.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(shade)
	dialog.set_anchors_preset(PRESET_CENTER_TOP)
	dialog.grow_horizontal = GROW_DIRECTION_BOTH
	dialog.offset_top = 110
	dialog.custom_minimum_size.x = WIDTH
	var red := Style.box(Style.WAR, Color.TRANSPARENT, 10)
	red.content_margin_top = 3
	dialog.add_theme_stylebox_override("panel", red)
	var dark := Style.box(Color("0d131c"), Style.LINE_STRONG, 10, 34, 30)
	dark.border_width_top = 0
	dark.corner_radius_top_left = 0
	dark.corner_radius_top_right = 0
	inner.add_theme_stylebox_override("panel", dark)
	dialog.add_child(inner)
	add_child(dialog)


## `country` capitulated; `record` is MwWorld.war_record for it. The
## numbers and regions are those of the wars it gave up, not of the game.
func show_defeat(country: int, record: Dictionary) -> void:
	for child in inner.get_children():
		inner.remove_child(child) # gone now, so the new size is not the old one's
		child.queue_free()
	var name := scenario.country_name(country)
	var enemies := PackedStringArray()
	for enemy in PackedInt32Array(record.get("enemies", PackedInt32Array())):
		enemies.append(scenario.country_name(enemy))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 22)

	var top := VBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.add_child(Style.label("DEFEAT  ·  " + Style.long_date(record.get("date", "")).to_upper(), 13,
		Style.WAR, Style.spaced(Style.BODY, 1)))
	var title := HBoxContainer.new()
	title.add_theme_constant_override("separation", 12)
	var swatch := Style.swatch(palette.get_pixel(country, 0))
	swatch.size_flags_vertical = SIZE_SHRINK_CENTER
	title.add_child(swatch)
	var heading := Style.label("%s capitulated" % name, 40, Style.TEXT, Style.TITLE)
	heading.name = "Title"
	heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	heading.custom_minimum_size.x = WIDTH - 98
	title.add_child(heading)
	top.add_child(title)
	var story := Style.label(_story(country, record), 16, Style.CREDIT)
	story.name = "Story"
	story.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	story.custom_minimum_size.x = WIDTH - 68
	top.add_child(story)
	column.add_child(top)

	var table := VBoxContainer.new()
	table.name = "Table"
	table.add_theme_constant_override("separation", 0)
	var days := int(record.get("war_days", 0))
	var cost: Dictionary = record.get("cost", {})
	var kept := float(record.get("land_kept", 1.0))
	var rows := [
		["At war with " + Style.list_and(enemies), "1 day" if days == 1 else "%d days" % days],
		["Divisions you raised", Style.thousands(int(cost.get("raised", 0)))],
		["Soldiers lost", Style.thousands(int(cost.get("lost", 0)))],
		["Enemy soldiers lost", Style.thousands(int(cost.get("inflicted", 0)))],
		# Rounded down: a sliver lost never shows as 100%.
		["Land %s keeps" % name, "100%" if kept >= 1.0 else "%d%%" % floori(kept * 100.0)],
	]
	for row in rows:
		table.add_child(_row(row[0], row[1]))
	column.add_child(table)

	# The regions this capitulation handed over, one line per country that
	# got some (the first few; the box must fit the screen).
	var by_country := {}
	for lost in record.get("ceded", []):
		var to := int(lost["to"])
		if not by_country.has(to):
			by_country[to] = PackedStringArray()
		by_country[to].append(scenario.region_name(int(lost["region"])))
	if not by_country.is_empty():
		var ceded := VBoxContainer.new()
		ceded.name = "Ceded"
		ceded.add_theme_constant_override("separation", 8)
		var receivers: Array = by_country.keys()
		for to in receivers.slice(0, MAX_RECEIVERS):
			ceded.add_child(_ceded_line(scenario.country_name(to), by_country[to]))
		if receivers.size() > MAX_RECEIVERS:
			var more := receivers.size() - MAX_RECEIVERS
			ceded.add_child(Style.label("and to %d more %s" % [more, "country" if more == 1 else "countries"],
				14, Style.MUTED))
		column.add_child(ceded)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 10)
	var watch := _button("Watch", "Watch the world go on", "flat")
	watch.pressed.connect(func() -> void: watch_pressed.emit())
	buttons.add_child(watch)
	var space := Control.new()
	space.size_flags_horizontal = SIZE_EXPAND_FILL
	buttons.add_child(space)
	var load := _button("Load", "Load your save", "plain")
	load.pressed.connect(func() -> void: load_pressed.emit())
	buttons.add_child(load)
	var fresh := Style.primary_button("New game", 19)
	fresh.name = "NewGame"
	fresh.focus_mode = FOCUS_NONE
	fresh.custom_minimum_size.y = 48
	fresh.pressed.connect(func() -> void: new_game_pressed.emit())
	buttons.add_child(fresh)
	column.add_child(buttons)
	inner.add_child(column)
	dialog.reset_size()
	dialog.offset_left = -dialog.size.x / 2.0
	dialog.offset_right = dialog.size.x / 2.0
	visible = true


## What happened, in two sentences, from this capitulation's own regions.
func _story(country: int, record: Dictionary) -> String:
	var why := "War support at home ran out."
	if not record.get("support_collapsed", false):
		var capital := scenario.country_capital_name(country)
		why = ("%s fell and most of the country with it." % capital) if capital != "" \
			else "Most of the country fell."
	var ceded: Array = record.get("ceded", [])
	var receivers := {}
	for region in ceded:
		receivers[int(region["to"])] = true
	var then := "The war is over: your divisions laid down their arms"
	if ceded.is_empty():
		then += ", and no region changed hands."
	elif receivers.size() == 1:
		then += ", and the regions %s held most of now belong to it." \
			% scenario.country_name(int(receivers.keys()[0]))
	else:
		then += ", and each enemy now owns the regions it held most of."
	return why + " " + then


func _row(caption: String, value: String) -> PanelContainer:
	var row := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color.TRANSPARENT
	style.border_color = Style.LINE
	style.border_width_top = 1
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	row.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	var left := Style.label(caption, 16, Style.MUTED)
	left.size_flags_horizontal = SIZE_EXPAND_FILL
	left.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	line.add_child(left)
	var right := Style.label(value, 16, Style.TEXT)
	right.name = "Value"
	line.add_child(right)
	row.add_child(line)
	return row


func _ceded_line(to: String, names: PackedStringArray) -> HBoxContainer:
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 10)
	var mark := Style.swatch(Color(Style.WAR, 0.8), 12)
	mark.size_flags_vertical = SIZE_SHRINK_BEGIN
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_child(mark)
	line.add_child(margin)
	var shown := names.slice(0, MAX_NAMES)
	var listed := ", ".join(shown)
	if names.size() > MAX_NAMES:
		listed += " and %d more" % (names.size() - MAX_NAMES)
	else:
		listed = Style.list_and(shown)
	var text := Style.label("Ceded to %s: %s" % [to, listed], 14, Style.CREDIT)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.custom_minimum_size.x = WIDTH - 90
	line.add_child(text)
	return line


## "flat" (no box until the mouse is over it) or "plain" (outlined).
func _button(id: String, text: String, kind: String) -> Button:
	var button := Button.new()
	button.name = id
	button.text = text
	button.focus_mode = FOCUS_NONE
	button.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	button.custom_minimum_size.y = 48
	button.add_theme_font_override("font", Style.TITLE)
	button.add_theme_font_size_override("font_size", 18 if kind == "flat" else 19)
	var ink := Style.MUTED if kind == "flat" else Style.TEXT
	for state in ["font_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state, ink)
	button.add_theme_color_override("font_hover_color", Style.TEXT)
	var line := Color.TRANSPARENT if kind == "flat" else Style.LINE_STRONG
	button.add_theme_stylebox_override("normal", Style.box(Color.TRANSPARENT, line, 6, 18, 0))
	button.add_theme_stylebox_override("hover", Style.box(Style.BUTTON_HOVER, line, 6, 18, 0))
	button.add_theme_stylebox_override("pressed", Style.box(Style.BUTTON, line, 6, 18, 0))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	return button
