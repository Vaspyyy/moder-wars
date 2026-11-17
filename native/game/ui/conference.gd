extends Control
## The peace conference after an enemy capitulated, on the right of the
## map: the winners in turn order (the one who defeated the most soldiers
## first), what each took so far, and on the player's turn the region
## clicked on the map with Take, or Puppet, Annex the rest (once every
## other winner is done) and Leave it. Each taken region is striped on the
## map in its taker's color. The loser cannot refuse; the game stays paused
## while it is open, and the map behind it takes clicks.

signal took(region: int)
signal puppet_pressed
signal annex_pressed
signal leave_pressed

const Style := preload("res://ui/style.gd")
const WIDTH := 560.0
## Picks listed before "and 4 more".
const MAX_PICKS := 6

var scenario: MwScenario
var palette: Image
var dialog := PanelContainer.new()
## False while the player is a puppet itself, which may make no puppets.
var can_puppet := true


func setup() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	# The map behind takes clicks, to choose a region.
	mouse_filter = MOUSE_FILTER_IGNORE
	dialog.set_anchors_preset(PRESET_TOP_RIGHT)
	dialog.grow_horizontal = GROW_DIRECTION_BEGIN
	dialog.offset_right = -16
	dialog.offset_top = 76
	dialog.custom_minimum_size.x = WIDTH
	dialog.add_theme_stylebox_override("panel", Style.box(Color("0d131c"), Style.LINE_STRONG, 10, 30, 26))
	Style.solid(dialog)
	add_child(dialog)


## `conference` is one of MwWorld.conferences; `selected` the region number
## clicked (0 for none) and `share` what it is worth to the loser (a share
## of its land's output); `defeated` maps each winner to the soldiers of the
## loser it defeated; `date` is today ("2026-11-17").
func show_conference(player: int, conference: Dictionary, selected: int, share: float,
		defeated: Dictionary, date: String) -> void:
	for child in dialog.get_children():
		dialog.remove_child(child) # gone now, so the new size is not the old one's
		child.queue_free()
	var loser := int(conference["loser"])
	var them := scenario.country_name(loser)
	var winners := PackedInt32Array(conference["winners"])
	var done := PackedInt32Array(conference["done"])
	var open := PackedInt32Array(conference["open"])
	var mine := int(conference["picking"]) == player
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 16)

	var top := VBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.add_child(Style.label("PEACE CONFERENCE  ·  %s CAPITULATED  ·  %s" % [them.to_upper(),
		Style.long_date(date).to_upper()], 13, Style.MUTED, Style.spaced(Style.BODY, 1)))
	var title := _wrapped("Divide %s" % them, 36, Style.TEXT, Style.TITLE)
	title.name = "Title"
	top.add_child(title)
	var how := "The winners take turns, one region each, the one who defeated the most soldiers first. %s can't refuse." % them
	if winners.size() == 1:
		how = "You won alone: take its regions one by one, or settle the rest at once. %s can't refuse." % them
	top.add_child(_wrapped(how, 15, Style.CREDIT))
	column.add_child(top)

	if winners.size() > 1:
		var turns := HBoxContainer.new()
		turns.name = "Turns"
		turns.add_theme_constant_override("separation", 10)
		for i in winners.size():
			var winner := winners[i]
			var status := "DONE" if done.has(winner) else ("YOUR TURN" if winner == player and mine
				else ("PICKING" if winner == int(conference["picking"]) else "WAITING"))
			turns.add_child(_turn_chip(i + 1, winner, status, int(defeated.get(winner, 0)), player))
		column.add_child(turns)

	var picks: Array = conference["picks"]
	if not picks.is_empty():
		var lines := VBoxContainer.new()
		lines.name = "Picks"
		lines.add_theme_constant_override("separation", 4)
		for pick in picks.slice(maxi(0, picks.size() - MAX_PICKS)):
			var by := int(pick["by"])
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 8)
			var swatch := Style.swatch(palette.get_pixel(by, 0), 10)
			swatch.size_flags_vertical = SIZE_SHRINK_CENTER
			row.add_child(swatch)
			var who := "You" if by == player else scenario.country_name(by)
			row.add_child(Style.label("%s took %s" % [who, scenario.region_name(int(pick["region"]))], 14,
				Style.CREDIT))
			lines.add_child(row)
		if picks.size() > MAX_PICKS:
			lines.add_child(Style.label("and %d taken before" % (picks.size() - MAX_PICKS), 13, Style.MUTED))
		column.add_child(lines)

	# The region chosen on the map, and Take.
	var choice := PanelContainer.new()
	choice.name = "Choice"
	choice.add_theme_stylebox_override("panel", Style.box(Color("121b27"), Color.TRANSPARENT, 8, 16, 12))
	var choice_row := HBoxContainer.new()
	choice_row.add_theme_constant_override("separation", 12)
	var words := VBoxContainer.new()
	words.add_theme_constant_override("separation", 2)
	words.size_flags_horizontal = SIZE_EXPAND_FILL
	if selected > 0 and open.has(selected):
		words.add_child(Style.label(scenario.region_name(selected), 17))
		words.add_child(Style.label("%d%% of what %s produces" % [roundi(share * 100.0), them], 13, Style.MUTED))
	else:
		words.add_child(_wrapped("Click one of %s's regions on the map to take it." % them, 14, Style.MUTED,
			Style.BODY, WIDTH - 230))
	choice_row.add_child(words)
	var take := Style.primary_button("Take %s" % scenario.region_name(selected) if selected > 0 and open.has(selected)
		else "Take", 19)
	take.name = "Take"
	take.custom_minimum_size.y = 48
	take.disabled = not (mine and selected > 0 and open.has(selected))
	take.pressed.connect(func() -> void: took.emit(selected))
	choice_row.add_child(take)
	choice.add_child(choice_row)
	column.add_child(choice)

	var rest := PackedStringArray()
	for region in open:
		rest.append(scenario.region_name(region))
	var settle := VBoxContainer.new()
	settle.add_theme_constant_override("separation", 8)
	settle.add_child(Style.label("Or settle the rest (%s) now:" % _names(rest), 13, Style.MUTED))
	var others_done := Array(winners).all(func(w: int) -> bool: return w == player or done.has(w))
	var puppet := _settle("Puppet", "Puppet %s" % them,
		"It keeps the rest, fights in your wars and pays you a quarter of its income.",
		func() -> void: puppet_pressed.emit())
	puppet.disabled = not mine
	if can_puppet:
		settle.add_child(puppet)
	else:
		puppet.queue_free()
	if others_done:
		var annex := _settle("Annex", "Annex the rest", "Every region left becomes yours; %s is gone from the map." % them,
			func() -> void: annex_pressed.emit())
		annex.disabled = not mine
		settle.add_child(annex)
	var leave := _settle("Leave", "Leave it", "%s keeps the rest, free." % them if others_done
		else "Take nothing more; the others go on.", func() -> void: leave_pressed.emit())
	leave.disabled = not mine
	settle.add_child(leave)
	column.add_child(settle)
	dialog.add_child(column)
	visible = true
	dialog.reset_size.call_deferred()


func _turn_chip(place: int, winner: int, status: String, defeated: int, player: int) -> PanelContainer:
	var chip := PanelContainer.new()
	chip.size_flags_horizontal = SIZE_EXPAND_FILL
	var active := status == "YOUR TURN" or status == "PICKING"
	var box := Style.box(Color.TRANSPARENT, Style.GOLD if active else Style.LINE_STRONG, 6, 12, 10)
	box.set_border_width_all(2 if active else 1)
	chip.add_theme_stylebox_override("panel", box)
	var lines := VBoxContainer.new()
	lines.add_theme_constant_override("separation", 2)
	lines.add_child(Style.label("%d  ·  %s" % [place, status], 12, Style.GOLD if active else Style.MUTED,
		Style.spaced(Style.BODY, 1)))
	var name := scenario.country_name(winner) + (" (you)" if winner == player else "")
	lines.add_child(Style.label(name, 19, Style.TEXT, Style.TITLE))
	lines.add_child(Style.label("%s soldiers defeated" % Style.thousands(defeated), 13, Style.MUTED))
	chip.add_child(lines)
	return chip


func _settle(id: String, title: String, explain: String, action: Callable) -> Button:
	var button := Button.new()
	button.name = id
	button.focus_mode = FOCUS_NONE
	button.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	button.custom_minimum_size = Vector2(WIDTH - 60, 58)
	for state in ["normal", "hover", "pressed", "disabled"]:
		var fill := Style.BUTTON_HOVER if state == "hover" else Color.TRANSPARENT
		button.add_theme_stylebox_override(state, Style.box(fill, Style.LINE_STRONG, 6, 16, 8))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	var lines := VBoxContainer.new()
	lines.set_anchors_preset(PRESET_FULL_RECT)
	lines.offset_left = 16
	lines.offset_right = -16
	lines.alignment = BoxContainer.ALIGNMENT_CENTER
	lines.add_theme_constant_override("separation", 2)
	lines.mouse_filter = MOUSE_FILTER_IGNORE
	lines.add_child(Style.label(title, 18, Style.TEXT, Style.TITLE))
	var line := Style.label(explain, 13, Style.MUTED)
	line.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	lines.add_child(line)
	button.add_child(lines)
	button.pressed.connect(action)
	return button


func _wrapped(text: String, size: int, color: Color, font: Font = Style.BODY, width := WIDTH - 60) -> Label:
	var label := Style.label(text, size, color, font)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size.x = width
	return label


## "Minsk, Mahilioŭ and Gomel", or the first few and a count.
func _names(names: PackedStringArray) -> String:
	if names.size() > 4:
		return "%s and %d more" % [", ".join(names.slice(0, 4)), names.size() - 4]
	return Style.list_and(names)
