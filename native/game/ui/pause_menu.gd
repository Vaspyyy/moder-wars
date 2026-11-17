extends Control
## The pause menu, opened with Esc when nothing else is open (a window, a
## selection or a line being drawn closes first). One box with three views:
##
## - the menu: Continue, Saves, New game, Quit to desktop;
## - Saves: a name and Save make a new save; below, the quick save (F5 and
##   F9) and the named saves of the country you lead in this scenario,
##   newest first, each with Load, Overwrite and Delete (those two ask once,
##   in their row);
## - "Leave this game?", before New game or Quit when the game changed since
##   the last save.
##
## The game stays paused while it is open. Esc goes back one step.

signal continued
signal new_game_pressed
signal quit_pressed
## The player chose to leave anyway: `action` is "new" or "quit".
signal leave_confirmed(action: String)
signal save_pressed(name: String)
signal load_pressed(path: String)
signal overwrite_pressed(path: String, name: String)
signal delete_pressed(path: String)

const Style := preload("res://ui/style.gd")
const MENU_WIDTH := 420.0
const SAVES_WIDTH := 640.0
const LEAVE_WIDTH := 480.0
## More rows than this scroll.
const ROWS_SHOWN := 5
const ROW_HEIGHT := 66.0

var dialog := PanelContainer.new()
## "menu", "saves" or "leave".
var view := "menu"
## What the views show, from main: `date` ("2026-10-25 14:00"), `name` and
## `color` of the led country, `enemies` (names), `scenario` (its name),
## `quick` and `saves` (entries from saves.gd) and `suggested` (a name for
## a new save).
var state: Dictionary = {}
## The row asking before it acts: [path, "overwrite" or "delete"], or [].
var confirming: Array = []
## What "Leave this game?" asks about: "new" or "quit".
var leaving := ""
var name_box: LineEdit = null
## What the player typed into the name box, kept while the Saves view is
## rebuilt (a question asked in a row, F5); empty for the suggested name.
var typed_name := ""
## Unix seconds now, for "saved 12 minutes ago" (tests replace it).
var now := func() -> float: return Time.get_unix_time_from_system()


## Esc goes back one step even while the name box has the keys (it would
## only stop editing otherwise).
func _input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if visible and key and key.pressed and not key.echo and key.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		back()


func setup() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	Style.solid(self)
	var shade := ColorRect.new()
	shade.color = Color(0.024, 0.039, 0.063, 0.72)
	shade.set_anchors_preset(PRESET_FULL_RECT)
	shade.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(shade)
	dialog.set_anchors_preset(PRESET_CENTER_TOP)
	dialog.grow_horizontal = GROW_DIRECTION_BOTH
	dialog.add_theme_stylebox_override("panel", Style.box(Color("0d131c"), Style.LINE_STRONG, 10, 28, 28))
	add_child(dialog)


## Esc: out of a question, then back to the menu, then back to the game.
func back() -> void:
	if view == "saves" and not confirming.is_empty():
		confirming = []
		show_saves(state)
	elif view != "menu":
		show_menu(state)
	else:
		continued.emit()


func show_menu(info: Dictionary) -> void:
	state = info
	view = "menu"
	confirming = []
	typed_name = ""
	var column := _begin(MENU_WIDTH, 150, 22)
	var top := _column(8)
	top.add_child(_kicker("PAUSED  ·  " + _clock(info["date"]).to_upper()))
	var title := HBoxContainer.new()
	title.add_theme_constant_override("separation", 12)
	var swatch := Style.swatch(info["color"])
	swatch.size_flags_vertical = SIZE_SHRINK_CENTER
	title.add_child(swatch)
	title.add_child(_wrapped(info["name"], 36, Style.TEXT, Style.TITLE, MENU_WIDTH - 86))
	top.add_child(title)
	var enemies: PackedStringArray = info["enemies"]
	if enemies.is_empty():
		top.add_child(_wrapped("At peace", 15, Style.PEACE, Style.BODY, MENU_WIDTH - 56))
	else:
		top.add_child(_wrapped("At war with " + Style.list_and(enemies), 15, Style.WAR, Style.BODY,
			MENU_WIDTH - 56))
	column.add_child(top)
	var buttons := _column(8)
	buttons.add_child(_big_button("Continue", "Continue", "", "Esc", "primary",
		func() -> void: continued.emit()))
	var count: int = info["saves"].size() + (0 if info["quick"].is_empty() else 1)
	var saves := "no saves yet" if count == 0 else ("1 save" if count == 1 else "%d saves" % count)
	buttons.add_child(_big_button("Saves", "Saves", "Save, load or delete  ·  " + saves, "", "more",
		func() -> void: show_saves(state)))
	var line := ColorRect.new()
	line.color = Style.LINE
	line.custom_minimum_size.y = 1
	buttons.add_child(_spaced(line, 6))
	buttons.add_child(_big_button("NewGame", "New game", "", "", "plain",
		func() -> void: new_game_pressed.emit()))
	buttons.add_child(_big_button("Quit", "Quit to desktop", "", "", "plain",
		func() -> void: quit_pressed.emit()))
	column.add_child(buttons)
	column.add_child(_wrapped("F5 saves and F9 loads the quick save at any time.", 13, Style.MUTED,
		Style.BODY, MENU_WIDTH - 56))
	_end()


func show_saves(info: Dictionary) -> void:
	state = info
	view = "saves"
	var column := _begin(SAVES_WIDTH, 110, 20)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 16)
	var heading := _column(6)
	heading.size_flags_horizontal = SIZE_EXPAND_FILL
	heading.add_child(_kicker("PAUSED  ·  %s  ·  %s" % [String(info["name"]).to_upper(),
		String(info["scenario"]).to_upper()]))
	heading.add_child(Style.label("Saves", 34, Style.TEXT, Style.TITLE))
	top.add_child(heading)
	var back_button := _small_button("Back", "Back", "plain", back)
	back_button.size_flags_vertical = SIZE_SHRINK_END
	_add_badge(back_button, "Esc")
	top.add_child(back_button)
	column.add_child(top)

	var form := _column(6)
	form.add_child(Style.label("Name of the new save", 13, Style.MUTED))
	var entry := HBoxContainer.new()
	entry.add_theme_constant_override("separation", 10)
	name_box = LineEdit.new()
	name_box.name = "SaveName"
	name_box.text = typed_name if typed_name != "" else info["suggested"]
	name_box.text_changed.connect(func(text: String) -> void: typed_name = text)
	name_box.placeholder_text = "Name this save"
	name_box.max_length = 60
	name_box.select_all_on_focus = true
	name_box.size_flags_horizontal = SIZE_EXPAND_FILL
	name_box.custom_minimum_size.y = 46
	name_box.add_theme_font_override("font", Style.BODY)
	name_box.add_theme_font_size_override("font_size", 16)
	name_box.add_theme_color_override("font_color", Style.TEXT)
	name_box.add_theme_color_override("font_placeholder_color", Style.MUTED)
	name_box.add_theme_color_override("caret_color", Style.GOLD)
	name_box.add_theme_color_override("selection_color", Color(Style.GOLD, 0.35))
	name_box.add_theme_stylebox_override("normal", Style.box(Color("121a26"), Style.OFF, 6, 14, 0))
	name_box.add_theme_stylebox_override("focus", Style.box(Color.TRANSPARENT, Style.GOLD, 6))
	name_box.text_submitted.connect(func(_text: String) -> void: _save())
	entry.add_child(name_box)
	var save := Style.primary_button("Save", 19)
	save.name = "Save"
	save.focus_mode = FOCUS_NONE
	save.custom_minimum_size.y = 46
	save.pressed.connect(_save)
	entry.add_child(save)
	form.add_child(entry)
	column.add_child(form)

	var rows := _column(0)
	rows.name = "Rows"
	if not info["quick"].is_empty():
		rows.add_child(_save_row(info["quick"], "Quick"))
	for i in info["saves"].size():
		rows.add_child(_save_row(info["saves"][i], "Row%d" % i))
	if rows.get_child_count() == 0:
		rows.free() # never shown, so freed here
		column.add_child(_wrapped("No saves yet: name one above and press Save.", 15, Style.MUTED,
			Style.BODY, SAVES_WIDTH - 60))
	elif rows.get_child_count() > ROWS_SHOWN:
		var scroll := ScrollContainer.new()
		scroll.name = "Scroll"
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.custom_minimum_size.y = ROWS_SHOWN * ROW_HEIGHT
		rows.size_flags_horizontal = SIZE_EXPAND_FILL
		scroll.add_child(rows)
		column.add_child(scroll)
	else:
		column.add_child(rows)
	if String(info.get("message", "")) != "":
		column.add_child(_wrapped(info["message"], 14, Style.WAR, Style.BODY, SAVES_WIDTH - 60))
	column.add_child(_wrapped("The saves of the country you lead in this scenario, newest first. "
		+ "Overwrite and Delete ask once before they replace or remove a save.", 13, Style.MUTED,
		Style.BODY, SAVES_WIDTH - 60))
	_end()
	_focus_name.call_deferred()


func show_leave(action: String) -> void:
	leaving = action
	view = "leave"
	confirming = []
	var column := _begin(LEAVE_WIDTH, 220, 16)
	column.add_child(_kicker("NEW GAME" if action == "new" else "QUIT TO DESKTOP"))
	column.add_child(_wrapped("Leave this game?", 34, Style.TEXT, Style.TITLE, LEAVE_WIDTH - 56))
	column.add_child(_wrapped("It changed since your last save. If you leave now, everything "
		+ "since then is lost.", 16, Style.CREDIT, Style.BODY, LEAVE_WIDTH - 56))
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_END
	buttons.add_theme_constant_override("separation", 10)
	buttons.add_child(_small_button("Stay", "Stay", "plain", func() -> void: show_menu(state)))
	buttons.add_child(_small_button("Leave", "Leave without saving", "danger",
		func() -> void: leave_confirmed.emit(leaving)))
	column.add_child(_spaced(buttons, 6))
	_end()


## One save in the list: its name, when in the game and when it was saved,
## and its buttons (or, while it asks, the question and its answers).
## `id` names the row: "Quick" for the quick save, else "Row<n>".
func _save_row(entry: Dictionary, id: String) -> Control:
	var path: String = entry["path"]
	var quick := id == "Quick"
	var row := PanelContainer.new()
	row.name = id
	var style := StyleBoxFlat.new()
	style.bg_color = Color.TRANSPARENT
	style.border_color = Style.LINE
	style.border_width_top = 1
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	row.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 12)
	var texts := _column(3)
	texts.size_flags_horizontal = SIZE_EXPAND_FILL
	var title := HBoxContainer.new()
	title.add_theme_constant_override("separation", 8)
	var name_label := Style.label(entry["name"], 19, Style.TEXT, Style.TITLE)
	name_label.name = "Name"
	if not quick:
		# A long name ends in "…" rather than pushing the buttons out.
		name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		name_label.size_flags_horizontal = SIZE_EXPAND_FILL
	title.add_child(name_label)
	if quick:
		var badge := Style.label("F5 · F9", 12, Style.MUTED, Style.BODY_MEDIUM)
		badge.add_theme_stylebox_override("normal", Style.box(Color.TRANSPARENT, Style.OFF, 3, 5, 1))
		badge.size_flags_vertical = SIZE_SHRINK_CENTER
		title.add_child(badge)
	texts.add_child(title)
	var detail := Style.label(when(entry), 13, Style.MUTED)
	detail.name = "When"
	texts.add_child(detail)
	line.add_child(texts)
	var asking: bool = confirming.size() == 2 and confirming[0] == path
	if asking:
		var deleting: bool = confirming[1] == "delete"
		var question := Style.label("Delete this save?" if deleting else "Replace this save?", 15,
			Style.CREDIT)
		question.size_flags_vertical = SIZE_SHRINK_CENTER
		line.add_child(question)
		line.add_child(_small_button("Cancel", "Cancel", "plain", func() -> void:
			confirming = []
			show_saves(state)))
		if deleting:
			line.add_child(_small_button("ConfirmDelete", "Delete", "danger", func() -> void:
				confirming = []
				delete_pressed.emit(path)))
		else:
			line.add_child(_small_button("ConfirmOverwrite", "Overwrite", "primary", func() -> void:
				confirming = []
				overwrite_pressed.emit(path, String(entry["name"]))))
	else:
		line.add_child(_small_button("Load", "Load", "fill", func() -> void: load_pressed.emit(path)))
		if not quick:
			line.add_child(_small_button("Overwrite", "Overwrite", "plain", func() -> void:
				confirming = [path, "overwrite"]
				show_saves(state)))
			var delete := _small_button("Delete", "", "plain", func() -> void:
				confirming = [path, "delete"]
				show_saves(state))
			delete.tooltip_text = "Delete %s" % entry["name"]
			delete.custom_minimum_size.x = 40
			var icon := TrashIcon.new()
			icon.anchor_left = 0.5
			icon.anchor_right = 0.5
			icon.anchor_top = 0.5
			icon.anchor_bottom = 0.5
			icon.offset_left = -8
			icon.offset_right = 8
			icon.offset_top = -8
			icon.offset_bottom = 8
			delete.add_child(icon)
			line.add_child(delete)
	row.add_child(line)
	return row


## "25 October 2026, 09:00 in the game  ·  saved 12 minutes ago".
func when(entry: Dictionary) -> String:
	var parts := PackedStringArray()
	if String(entry["time"]) != "":
		parts.append(_clock(entry["time"]) + " in the game")
	parts.append(saved_text(float(entry["saved"]), now.call(), String(entry.get("local", "")),
		Time.get_datetime_string_from_system()))
	return "  ·  ".join(parts)


## When a save was made, from Unix seconds `saved` and now (`at`): "saved
## just now", "saved 12 minutes ago", "saved today, 02:40", "saved 16
## November, 23:10". The clock and day come from `local` and `today`
## (local times, "2026-11-17T02:40:00") when given, which stay right across
## a change to or from summer time; else from today's offset to UTC.
static func saved_text(saved: float, at: float, local := "", today_local := "") -> String:
	var ago := at - saved
	if ago < 60.0:
		return "saved just now"
	if ago < 3600.0:
		var minutes := int(ago / 60.0)
		return "saved 1 minute ago" if minutes == 1 else "saved %d minutes ago" % minutes
	var then: Dictionary
	var today: Dictionary
	if local != "" and today_local != "":
		then = Time.get_datetime_dict_from_datetime_string(local, false)
		today = Time.get_datetime_dict_from_datetime_string(today_local, false)
	else:
		var bias := int(Time.get_time_zone_from_system().get("bias", 0)) * 60
		then = Time.get_datetime_dict_from_unix_time(int(saved) + bias)
		today = Time.get_datetime_dict_from_unix_time(int(at) + bias)
	var clock := "%02d:%02d" % [then["hour"], then["minute"]]
	if then["year"] == today["year"] and then["month"] == today["month"] and then["day"] == today["day"]:
		return "saved today, " + clock
	var day := "%d %s" % [then["day"], Style.MONTHS[int(then["month"]) - 1]]
	if then["year"] != today["year"]:
		day += " %d" % then["year"]
	return "saved %s, %s" % [day, clock]


## The name box takes the keys once it is on screen (the view may have
## been rebuilt again meanwhile).
func _focus_name() -> void:
	if visible and view == "saves" and is_instance_valid(name_box) and name_box.is_inside_tree():
		name_box.grab_focus()


func _save() -> void:
	var text := name_box.text.strip_edges()
	if text == "":
		name_box.placeholder_text = "Give the save a name first"
		name_box.grab_focus()
		return
	save_pressed.emit(text)


## "2026-10-25 14:00" -> "25 October 2026, 14:00".
func _clock(time: String) -> String:
	var parts := time.split(" ")
	return Style.long_date(parts[0]) + (", " + parts[1] if parts.size() > 1 else "")


## Empty the box and give it a column `width` wide, `top` pixels down.
func _begin(width: float, top: float, separation: int) -> VBoxContainer:
	for child in dialog.get_children():
		dialog.remove_child(child) # gone now, so the new size is not the old one's
		child.queue_free()
	name_box = null
	dialog.custom_minimum_size.x = width
	dialog.offset_top = top
	var column := _column(separation)
	dialog.add_child(column)
	return column


func _end() -> void:
	dialog.reset_size()
	# Centered: the box grows both ways from the middle of the screen.
	dialog.offset_left = -dialog.size.x / 2.0
	dialog.offset_right = dialog.size.x / 2.0
	visible = true


func _column(separation: int) -> VBoxContainer:
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", separation)
	return column


func _kicker(text: String) -> Label:
	return Style.label(text, 13, Style.MUTED, Style.spaced(Style.BODY, 1))


func _wrapped(text: String, size: int, color: Color, font: Font, width: float) -> Label:
	var label := Style.label(text, size, color, font)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size.x = width
	return label


## `control` with `space` pixels above and below.
func _spaced(control: Control, space: int) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_top", space)
	margin.add_theme_constant_override("margin_bottom", space)
	margin.add_child(control)
	return margin


## A full-width menu button: a title, an optional line under it, and a key
## badge or a chevron on the right. `kind`: "primary" (gold), "more" (dark,
## with a chevron) or "plain" (outlined).
func _big_button(id: String, title: String, sub: String, key: String, kind: String,
		action: Callable) -> Button:
	var button := _styled(Button.new(), kind)
	button.name = id
	button.custom_minimum_size.y = 52 if sub == "" else 62
	var row := HBoxContainer.new()
	row.set_anchors_preset(PRESET_FULL_RECT)
	row.offset_left = 18
	row.offset_right = -18
	row.add_theme_constant_override("separation", 12)
	row.mouse_filter = MOUSE_FILTER_IGNORE
	var texts := _column(2)
	texts.alignment = BoxContainer.ALIGNMENT_CENTER
	texts.size_flags_horizontal = SIZE_EXPAND_FILL
	texts.mouse_filter = MOUSE_FILTER_IGNORE
	var ink := Style.ON_GOLD if kind == "primary" else Style.TEXT
	texts.add_child(Style.label(title, 20, ink, Style.TITLE_BOLD if kind == "primary" else Style.TITLE))
	if sub != "":
		texts.add_child(Style.label(sub, 13, Style.MUTED))
	row.add_child(texts)
	if key != "":
		var badge := Style.label(key, 12, ink, Style.BODY_MEDIUM)
		badge.add_theme_stylebox_override("normal", Style.box(Color.TRANSPARENT, Color(ink, 0.4), 3, 6, 1))
		badge.size_flags_vertical = SIZE_SHRINK_CENTER
		row.add_child(badge)
	if kind == "more":
		var chevron := Chevron.new()
		chevron.custom_minimum_size = Vector2(10, 16)
		chevron.size_flags_vertical = SIZE_SHRINK_CENTER
		row.add_child(chevron)
	button.add_child(row)
	button.pressed.connect(action)
	return button


## A button sized to its text. `kind`: "fill" (dark), "plain" (outlined),
## "primary" (gold) or "danger" (red).
func _small_button(id: String, text: String, kind: String, action: Callable) -> Button:
	var button := _styled(Button.new(), kind)
	button.name = id
	button.text = text
	button.custom_minimum_size.y = 40
	button.size_flags_vertical = SIZE_SHRINK_CENTER
	button.pressed.connect(action)
	return button


func _add_badge(button: Button, key: String) -> void:
	var badge := Style.label(key, 12, Style.MUTED, Style.BODY_MEDIUM)
	badge.add_theme_stylebox_override("normal", Style.box(Color.TRANSPARENT, Style.OFF, 3, 5, 1))
	button.add_theme_constant_override("h_separation", 8)
	# Room on the right for the badge, which sits in the middle of it.
	var pad := 14 + 34
	for state_name in ["normal", "hover", "pressed"]:
		var box := button.get_theme_stylebox(state_name).duplicate() as StyleBoxFlat
		box.content_margin_right = pad
		button.add_theme_stylebox_override(state_name, box)
	badge.set_anchors_preset(PRESET_CENTER_RIGHT)
	badge.grow_horizontal = GROW_DIRECTION_BEGIN
	badge.grow_vertical = GROW_DIRECTION_BOTH
	badge.offset_right = -12
	button.add_child(badge)


func _styled(button: Button, kind: String) -> Button:
	var fill := Color("161f2c")
	var line := Style.LINE_STRONG
	var ink := Style.TEXT
	var font: Font = Style.BODY
	var size := 15
	match kind:
		"primary":
			fill = Style.GOLD
			line = Color.TRANSPARENT
			ink = Style.ON_GOLD
			font = Style.TITLE_BOLD
			size = 19
		"danger":
			fill = Style.WAR
			line = Color.TRANSPARENT
			ink = Color.WHITE
			font = Style.BODY_STRONG
		"plain":
			fill = Color.TRANSPARENT
	var hover := Style.GOLD_HOVER if kind == "primary" else (Style.WAR.lightened(0.12)
		if kind == "danger" else Style.BUTTON_HOVER)
	button.add_theme_stylebox_override("normal", Style.box(fill, line, 6, 16, 0))
	button.add_theme_stylebox_override("hover", Style.box(hover, line, 6, 16, 0))
	button.add_theme_stylebox_override("pressed", Style.box(hover.darkened(0.08), line, 6, 16, 0))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	button.add_theme_font_override("font", font)
	button.add_theme_font_size_override("font_size", size)
	for state_name in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state_name, ink)
	button.focus_mode = FOCUS_NONE
	button.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	return button


class Chevron extends Control:
	func _init() -> void:
		mouse_filter = MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var w := size.x
		var h := size.y
		draw_polyline(PackedVector2Array([Vector2(2, 2), Vector2(w - 2, h / 2), Vector2(2, h - 2)]),
			Color("9aa7b8"), 2.0, true)


class TrashIcon extends Control:
	func _init() -> void:
		mouse_filter = MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var ink := Color("9aa7b8")
		draw_line(Vector2(3, 4), Vector2(13, 4), ink, 1.5, true)
		draw_polyline(PackedVector2Array([Vector2(6, 4), Vector2(6, 2.5), Vector2(10, 2.5),
			Vector2(10, 4)]), ink, 1.5, true)
		draw_polyline(PackedVector2Array([Vector2(4.5, 4), Vector2(5.2, 13.5), Vector2(10.8, 13.5),
			Vector2(11.5, 4)]), ink, 1.5, true)
