extends Control
## The peace window, for an offer made to the player (Refuse or Accept) or
## one the player is about to make (Cancel or Offer peace). It says what
## the peace would do: the regions each side would hand over, listed here
## and striped on the map (gold for the player's gains, red for losses),
## and that everything else goes back. A table compares the two sides.
## The game stays paused while it is open.

signal answered(accept: bool)

const Style := preload("res://ui/style.gd")
const WIDTH := 600.0
const MAX_NAMES := 6

var scenario: MwScenario
var palette: Image
var dialog := PanelContainer.new()
var incoming := true


func setup() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	Style.solid(self)
	var shade := ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.07, 0.25)
	shade.set_anchors_preset(PRESET_FULL_RECT)
	shade.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(shade)
	# On the right, so the striped regions show on the left.
	dialog.set_anchors_preset(PRESET_TOP_RIGHT)
	dialog.grow_horizontal = GROW_DIRECTION_BEGIN
	dialog.offset_right = -16
	dialog.offset_top = 76
	dialog.custom_minimum_size.x = WIDTH
	dialog.add_theme_stylebox_override("panel", Style.box(Color("0d131c"), Style.LINE_STRONG, 10, 34, 30))
	add_child(dialog)


## `sides` maps "player" and "other" to dictionaries with `divisions`,
## `personnel`, `land` (share of own land still held, 0 to 1), `income_k`
## and `support` (per mille). `terms` come from MwWorld.peace_terms.
func show_terms(offer_incoming: bool, player: int, other: int, terms: Array, sides: Dictionary) -> void:
	incoming = offer_incoming
	for child in dialog.get_children():
		dialog.remove_child(child) # gone now, so the new size is not the old one's
		child.queue_free()
	var them := scenario.country_name(other)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 22)

	var top := VBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	var kicker := ("PEACE OFFER  ·  OPEN FOR %d DAYS" % MwWorld.OFFER_DAYS) if incoming else "OFFER PEACE"
	top.add_child(Style.label(kicker + "  ·  THE GAME IS PAUSED", 13, Style.MUTED, Style.spaced(Style.BODY, 1)))
	var title := Style.label(("%s offers peace" % them) if incoming else ("Offer peace to %s" % them),
		38, Style.TEXT, Style.TITLE)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.custom_minimum_size.x = WIDTH - 68
	top.add_child(title)
	var gains := PackedStringArray()
	var losses := PackedStringArray()
	for term in terms:
		var name := scenario.region_name(int(term["region"]))
		if int(term["to"]) == player:
			gains.append(name)
		elif int(term["from"]) == player:
			losses.append(name)
	var when := "If you accept, the war ends today." if incoming else \
		"If %s accepts, the war ends that day." % them
	var what := "No region changes hands"
	if gains.size() > 0 and losses.size() > 0:
		what = "%s cedes %s to you, you cede %s to it" % [them, _names(gains), _names(losses)]
	elif gains.size() > 0:
		what = "%s cedes %s to you" % [them, _names(gains)]
	elif losses.size() > 0:
		what = "You cede %s to %s" % [_names(losses), them]
	var text := Style.label("%s %s, and everything else either side holds of the other's land goes back." % [when, what],
		16, Style.CREDIT)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.custom_minimum_size.x = WIDTH - 68
	top.add_child(text)
	column.add_child(top)

	if gains.size() > 0 or losses.size() > 0:
		var lists := VBoxContainer.new()
		lists.add_theme_constant_override("separation", 6)
		if gains.size() > 0:
			lists.add_child(_region_line(Style.GOLD, "You gain", gains))
		if losses.size() > 0:
			lists.add_child(_region_line(Style.WAR, "You give up", losses))
		column.add_child(lists)

	var table := GridContainer.new()
	table.columns = 3
	table.add_theme_constant_override("h_separation", 12)
	table.add_theme_constant_override("v_separation", 10)
	table.add_child(Control.new())
	for country in [player, other]:
		var head := HBoxContainer.new()
		head.alignment = BoxContainer.ALIGNMENT_END
		head.add_theme_constant_override("separation", 8)
		var swatch := Style.swatch(palette.get_pixel(country, 0), 12)
		swatch.size_flags_vertical = SIZE_SHRINK_CENTER
		head.add_child(swatch)
		head.add_child(Style.label(scenario.country_name(country), 19, Style.TEXT, Style.TITLE))
		head.custom_minimum_size.x = 150
		table.add_child(head)
	var mine: Dictionary = sides["player"]
	var theirs: Dictionary = sides["other"]
	for row in [
		["Divisions", str(mine["divisions"]), str(theirs["divisions"])],
		["Soldiers", Style.thousands(int(mine["personnel"])), Style.thousands(int(theirs["personnel"]))],
		["Own land still held", _percent(mine["land"]), _percent(theirs["land"])],
		["Income a day", "$%.2f bn" % (int(mine["income_k"]) / 1e6), "$%.2f bn" % (int(theirs["income_k"]) / 1e6)],
		["War support", "%d%%" % roundi(int(mine["support"]) / 10.0), "%d%%" % roundi(int(theirs["support"]) / 10.0)],
	]:
		var key := Style.label(row[0], 16, Style.MUTED)
		key.size_flags_horizontal = SIZE_EXPAND_FILL
		table.add_child(key)
		for value in [row[1], row[2]]:
			var cell := Style.label(value, 16)
			cell.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			table.add_child(cell)
	column.add_child(table)

	var bottom := HBoxContainer.new()
	bottom.add_theme_constant_override("separation", 16)
	# Ahead or behind on land (by more than half a percent) and on soldiers.
	var land_gap := float(mine["land"]) - float(theirs["land"])
	var score := signi(int(mine["personnel"]) - int(theirs["personnel"])) \
		+ (signi(int(land_gap * 1000)) if absf(land_gap) > 0.005 else 0)
	var standing := "You are winning." if score > 0 else ("You are losing." if score < 0 else "The war is even.")
	if not incoming:
		standing += " The AI accepts peace when it is losing or its people tire of the war."
	var hint := Style.label(standing, 13, Style.MUTED)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.size_flags_horizontal = SIZE_EXPAND_FILL
	hint.size_flags_vertical = SIZE_SHRINK_CENTER
	bottom.add_child(hint)
	var no := Style.tool_button("Refuse" if incoming else "Cancel", "N" if incoming else "Esc")
	no.custom_minimum_size.y = 48
	no.pressed.connect(func() -> void: answered.emit(false))
	bottom.add_child(no)
	var yes := Style.primary_button("Accept peace" if incoming else "Offer peace", 19)
	yes.custom_minimum_size.y = 48
	yes.pressed.connect(func() -> void: answered.emit(true))
	bottom.add_child(yes)
	column.add_child(bottom)
	dialog.add_child(column)
	visible = true
	# Wrapped text knows its height only once laid out at its width.
	dialog.reset_size.call_deferred()


func _region_line(color: Color, caption: String, names: PackedStringArray) -> HBoxContainer:
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 10)
	var swatch := Style.swatch(Color(color, 0.8), 12)
	swatch.size_flags_vertical = SIZE_SHRINK_BEGIN
	line.add_child(swatch)
	var text := Style.label("%s: %s" % [caption, ", ".join(names)], 14, Style.CREDIT)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.custom_minimum_size.x = WIDTH - 68 - 22
	line.add_child(text)
	return line


## "Moselle, Meurthe-et-Moselle and Haut-Rhin", or the first few and a count.
func _names(names: PackedStringArray) -> String:
	if names.size() > MAX_NAMES:
		return "%s and %d more regions" % [", ".join(names.slice(0, MAX_NAMES)), names.size() - MAX_NAMES]
	return Style.list_and(names)


func _percent(share: float) -> String:
	return "%.1f%%" % (share * 100.0)
