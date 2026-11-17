extends Control
## The player's faction, on the right of the map (the top bar's faction
## button opens it): what membership means, the faction's divisions and
## soldiers next to its strongest rival's, every member (strongest first,
## the list scrolls), Leave (asks once) and Close. The leader can rename it. While it
## is open the factions are striped on the map, the player's in blue and
## the others in red. The game keeps running behind it; Esc closes it.

signal left_pressed
signal closed
signal name_entered(name: String)

const Style := preload("res://ui/style.gd")
const WIDTH := 560.0
const OURS := Color("4f8fe0")
const OTHERS := Color("e5534b")
## More members than this scroll.
const ROWS_SHOWN := 8
const ROW_HEIGHT := 38.0

var scenario: MwScenario
var palette: Image
var dialog := PanelContainer.new()


func setup() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	mouse_filter = MOUSE_FILTER_IGNORE
	dialog.set_anchors_preset(PRESET_TOP_RIGHT)
	dialog.grow_horizontal = GROW_DIRECTION_BEGIN
	dialog.offset_right = -16
	dialog.offset_top = 76
	dialog.custom_minimum_size.x = WIDTH
	dialog.add_theme_stylebox_override("panel", Style.box(Color("0d131c"), Style.LINE_STRONG, 10, 30, 26))
	Style.solid(dialog)
	add_child(dialog)
	visible = false


## `faction` is one of MwWorld.factions; `members` maps each member to
## MwWorld.country_info; `rival` is the strongest other faction (empty for
## none) with `divisions`; `at_war` whether the player is at war.
func show_faction(player: int, faction: Dictionary, members: Dictionary, rival: Dictionary,
		at_war: bool) -> void:
	for child in dialog.get_children():
		dialog.remove_child(child)
		child.queue_free()
	var name := String(faction["name"])
	var leader := int(faction["leader"])
	var ids := PackedInt32Array(faction["members"])
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 16)

	var top := VBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.add_child(Style.label("YOUR FACTION  ·  %s" % ("AT WAR" if at_war else "AT PEACE"), 13,
		Style.WAR if at_war else Style.MUTED, Style.spaced(Style.BODY, 1)))
	if leader == player:
		var box := LineEdit.new()
		box.name = "Name"
		box.text = name
		box.max_length = 40
		box.add_theme_font_override("font", Style.TITLE)
		box.add_theme_font_size_override("font_size", 34)
		box.add_theme_stylebox_override("normal", Style.box(Color.TRANSPARENT, Style.LINE, 6, 10, 2))
		box.add_theme_stylebox_override("focus", Style.box(Color.TRANSPARENT, Style.GOLD, 6, 10, 2))
		box.tooltip_text = "Type a new name and press Enter"
		box.text_submitted.connect(func(text: String) -> void:
			box.release_focus()
			if text.strip_edges() != "":
				name_entered.emit(text.strip_edges()))
		top.add_child(box)
	else:
		var title := Style.label(name, 38, Style.TEXT, Style.TITLE)
		title.name = "Title"
		top.add_child(title)
	var about := Style.label("%d members, led by %s. If any member is attacked, all of you are at war "
		% [ids.size(), "you" if leader == player else scenario.country_name(leader)]
		+ "with the attacker. If a member attacks, the others choose whether to join.", 15, Style.CREDIT)
	about.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	about.custom_minimum_size.x = WIDTH - 60
	top.add_child(about)
	column.add_child(top)

	var divisions := 0
	var soldiers := 0
	for id in ids:
		var info: Dictionary = members.get(id, {})
		divisions += int(info.get("divisions", 0))
		soldiers += int(info.get("personnel", 0))
	var stats := HBoxContainer.new()
	stats.name = "Stats"
	stats.add_theme_constant_override("separation", 10)
	stats.add_child(_stat("Divisions", str(divisions)))
	stats.add_child(_stat("Soldiers", Style.people(soldiers)))
	if rival.is_empty():
		stats.add_child(_stat("Rival", "None"))
	else:
		stats.add_child(_stat("Rival: %s" % rival["name"], "%d div." % int(rival["divisions"])))
	column.add_child(stats)

	var table := VBoxContainer.new()
	table.add_theme_constant_override("separation", 0)
	table.add_child(_row(0, "Member", "Divisions", "Soldiers", Style.MUTED, false, 12))
	var sorted := Array(ids)
	sorted.sort_custom(func(a: int, b: int) -> bool:
		var da := int(members.get(a, {}).get("divisions", 0))
		var db := int(members.get(b, {}).get("divisions", 0))
		return da > db if da != db else a < b)
	var rows := VBoxContainer.new()
	rows.name = "Members"
	rows.add_theme_constant_override("separation", 0)
	for id in sorted:
		var info: Dictionary = members.get(id, {})
		var who := scenario.country_name(id) + (" (you)" if id == player else "")
		var row := _row(id, who, str(int(info.get("divisions", 0))),
			Style.thousands(int(info.get("personnel", 0))), Style.TEXT, id == leader, 16)
		row.name = "Member-%d" % id
		rows.add_child(row)
	if sorted.size() > ROWS_SHOWN:
		var scroll := ScrollContainer.new()
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.custom_minimum_size = Vector2(WIDTH - 60, ROWS_SHOWN * ROW_HEIGHT)
		rows.size_flags_horizontal = SIZE_EXPAND_FILL
		scroll.add_child(rows)
		table.add_child(scroll)
	else:
		table.add_child(rows)
	column.add_child(table)

	var bottom := HBoxContainer.new()
	bottom.add_theme_constant_override("separation", 12)
	# Leave asks once: the first press turns it into "Press again".
	var leave := Style.tool_button("Leave %s" % name, "")
	leave.name = "Leave"
	leave.custom_minimum_size.y = 48
	var caption: Label = leave.find_children("*", "Label", true, false)[0]
	caption.add_theme_color_override("font_color", Style.WAR)
	leave.pressed.connect(func() -> void:
		if caption.text.begins_with("Press again"):
			left_pressed.emit()
		else:
			caption.text = "Press again to leave %s" % name)
	bottom.add_child(leave)
	var gap := Control.new()
	gap.size_flags_horizontal = SIZE_EXPAND_FILL
	bottom.add_child(gap)
	var close := Style.tool_button("Close", "Esc")
	close.name = "Close"
	close.custom_minimum_size.y = 48
	close.pressed.connect(func() -> void: closed.emit())
	bottom.add_child(close)
	column.add_child(bottom)
	var note := ("Invite countries from their cards on the map." if leader == player
		else "Only %s invites new members." % scenario.country_name(leader))
	note += " Leaving in peacetime costs nothing; in a war, a separate peace takes you out."
	var footnote := Style.label(note, 13, Style.MUTED)
	footnote.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	footnote.custom_minimum_size.x = WIDTH - 60
	column.add_child(footnote)
	dialog.add_child(column)
	visible = true
	dialog.reset_size.call_deferred()


func _stat(caption: String, value: String) -> PanelContainer:
	var box := PanelContainer.new()
	box.size_flags_horizontal = SIZE_EXPAND_FILL
	box.add_theme_stylebox_override("panel", Style.box(Color("121b27"), Color.TRANSPARENT, 8, 14, 10))
	var lines := VBoxContainer.new()
	lines.add_theme_constant_override("separation", 2)
	var top := Style.label(caption, 12, Style.MUTED)
	top.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	lines.add_child(top)
	lines.add_child(Style.label(value, 24, Style.TEXT, Style.TITLE))
	box.add_child(lines)
	return box


func _row(id: int, who: String, divisions: String, soldiers: String, color: Color, leader: bool,
		size: int) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.custom_minimum_size.y = ROW_HEIGHT if id > 0 else 22.0
	var swatch := Control.new()
	swatch.custom_minimum_size = Vector2(12, 12)
	if id > 0:
		swatch = Style.swatch(palette.get_pixel(id, 0), 12)
	swatch.size_flags_vertical = SIZE_SHRINK_CENTER
	row.add_child(swatch)
	var name := HBoxContainer.new()
	name.add_theme_constant_override("separation", 8)
	name.size_flags_horizontal = SIZE_EXPAND_FILL
	var label := Style.label(who, size, color)
	label.size_flags_vertical = SIZE_SHRINK_CENTER
	name.add_child(label)
	if leader:
		var tag := PanelContainer.new()
		tag.size_flags_vertical = SIZE_SHRINK_CENTER
		tag.add_theme_stylebox_override("panel", Style.box(Color.TRANSPARENT, Color("6b5220"), 3, 6, 1))
		tag.add_child(Style.label("Leader", 12, Style.GOLD))
		name.add_child(tag)
	row.add_child(name)
	for value in [[divisions, 84.0], [soldiers, 96.0]]:
		var cell := Style.label(value[0], size if id > 0 else 12, color if id > 0 else Style.MUTED)
		cell.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		cell.custom_minimum_size.x = value[1]
		cell.size_flags_vertical = SIZE_SHRINK_CENTER
		row.add_child(cell)
	return row
