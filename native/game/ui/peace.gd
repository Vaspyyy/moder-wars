extends Control
## The peace window, on the right of the map, in one of two ways:
##
## - Peace talks (`show_talks`): your terms for an enemy. Clicking its
##   regions on the map adds them or drops them (yours too, to give them
##   up); each is listed with how much of it you hold and what it is worth
##   to its owner, and a meter says how likely the enemy is to accept.
##   Cancel, White peace (asks for nothing) or Send terms. While it is open
##   the map behind it takes clicks.
## - Peace terms (`show_offer`): terms an enemy sent you. Refuse (the war
##   goes on) or Accept.
##
## The regions in the terms are striped on the map (gold for what you gain,
## red for what you give up). The game stays paused while it is open.

## Accept (true) or Refuse an offer; in the talks, Send terms (true) or
## Cancel.
signal answered(accept: bool)
## The talks: a region's ✕ was pressed, or White peace.
signal dropped(region: int)
signal white_peace

const Style := preload("res://ui/style.gd")
const WIDTH := 560.0
const MAX_NAMES := 6
## More rows than this scroll.
const ROWS_SHOWN := 5

var scenario: MwScenario
var palette: Image
var dialog := PanelContainer.new()
var incoming := true
## The faction this peace would take the player out of (a separate peace:
## its allies fight on), or "" (main sets it before showing).
var leaving := ""


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
	dialog.add_theme_stylebox_override("panel", Style.box(Color("0d131c"), Style.LINE_STRONG, 10, 30, 26))
	Style.solid(dialog)
	add_child(dialog)


## Terms `other` sent the player: `terms` are region numbers, `sides` maps
## "player" and "other" to dictionaries with `divisions`, `land` (share of
## own land still held, 0 to 1) and `support` (per mille), and `talks` is
## MwWorld.peace_talks(other, player, terms).
func show_offer(player: int, other: int, terms: PackedInt32Array, sides: Dictionary, talks: Dictionary) -> void:
	incoming = true
	mouse_filter = MOUSE_FILTER_STOP
	var column := _begin()
	var them := scenario.country_name(other)
	var gains := PackedStringArray()
	var losses := PackedStringArray()
	for row in talks.get("regions", []):
		var name := scenario.region_name(int(row["region"]))
		if int(row["owner"]) == player:
			losses.append(name)
		else:
			gains.append(name)
	var asked := float(talks.get("asked", 0.0))
	var top := _top("PEACE TERMS  ·  OPEN FOR %d DAYS  ·  THE GAME IS PAUSED" % MwWorld.OFFER_DAYS, "")
	var title := "%s offers a white peace" % them
	if losses.size() > 0:
		title = "%s offers peace, for %s" % [them,
			"one region" if losses.size() == 1 else "%d regions" % losses.size()]
	elif gains.size() > 0:
		title = "%s offers peace and %s" % [them,
			"a region" if gains.size() == 1 else "%d regions" % gains.size()]
	(top.get_child(1) as Label).text = title
	var what := "No region changes hands"
	if gains.size() > 0 and losses.size() > 0:
		what = "%s becomes %s's and %s becomes yours" % [_names(losses), them, _names(gains)]
	elif losses.size() > 0:
		what = "%s %s %s's (striped on the map)" % [_names(losses), "becomes" if losses.size() == 1 else "become", them]
	elif gains.size() > 0:
		what = "%s %s yours" % [_names(gains), "becomes" if gains.size() == 1 else "become"]
	top.add_child(_wrapped("Accept, and the war ends today: %s, and everything else either side holds of the other's land goes back. Refuse, and the war goes on." % what,
		15, Style.CREDIT))
	column.add_child(top)

	var table := GridContainer.new()
	table.name = "Table"
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
		head.custom_minimum_size.x = 140
		table.add_child(head)
	var mine: Dictionary = sides["player"]
	var theirs: Dictionary = sides["other"]
	for row in [
		["Divisions", str(mine["divisions"]), str(theirs["divisions"])],
		["Own land still held", _percent(mine["land"]), _percent(theirs["land"])],
		["War support", "%d%%" % roundi(int(mine["support"]) / 10.0), "%d%%" % roundi(int(theirs["support"]) / 10.0)],
		["What these terms take", "%d%% of your output" % roundi(asked * 100.0) if asked > 0.0 else "nothing", ""],
	]:
		var key := Style.label(row[0], 16, Style.MUTED)
		key.size_flags_horizontal = SIZE_EXPAND_FILL
		table.add_child(key)
		for value in [row[1], row[2]]:
			var cell := Style.label(value, 16)
			cell.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			table.add_child(cell)
	column.add_child(table)
	if leaving != "":
		column.add_child(_leaving_warning(them))

	var bottom := HBoxContainer.new()
	bottom.add_theme_constant_override("separation", 12)
	var hint := _wrapped("Refusing costs nothing but the war going on.", 13, Style.MUTED, 150)
	hint.size_flags_horizontal = SIZE_EXPAND_FILL
	hint.size_flags_vertical = SIZE_SHRINK_CENTER
	bottom.add_child(hint)
	bottom.add_child(_button("Refuse", "Refuse, keep fighting", "N", func() -> void: answered.emit(false)))
	var yes := Style.primary_button("Accept terms", 19)
	yes.name = "Accept"
	yes.custom_minimum_size.y = 48
	yes.pressed.connect(func() -> void: answered.emit(true))
	bottom.add_child(yes)
	column.add_child(bottom)
	_end(column)


## The player's terms for `other`: `terms` are region numbers, `talks` is
## MwWorld.peace_talks for them, `closed_days` the days until `other` talks
## again after a refusal (0 when it would listen now).
func show_talks(player: int, other: int, terms: PackedInt32Array, talks: Dictionary, closed_days: int) -> void:
	incoming = false
	# The map behind takes clicks, to add or drop regions.
	mouse_filter = MOUSE_FILTER_IGNORE
	var column := _begin()
	var them := scenario.country_name(other)
	var top := _top("PEACE TALKS  ·  THE GAME IS PAUSED", "Your terms for %s" % them)
	top.add_child(_wrapped("Click its regions on the map to ask for them, or yours to give them up. "
		+ "The ones you hold come cheap; each one you don't hold makes %s more likely to refuse." % them,
		15, Style.CREDIT))
	column.add_child(top)

	var rows := VBoxContainer.new()
	rows.name = "Terms"
	rows.add_theme_constant_override("separation", 0)
	var by_region := {}
	for row in talks.get("regions", []):
		by_region[int(row["region"])] = row
	for region in terms:
		rows.add_child(_term_row(region, player, them, by_region.get(region, {})))
	if terms.is_empty():
		rows.add_child(_wrapped("A white peace: no region changes hands, and all land goes back.", 14,
			Style.MUTED))
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.add_child(rows)
	rows.size_flags_horizontal = SIZE_EXPAND_FILL
	scroll.custom_minimum_size.y = 62.0 * mini(maxi(terms.size(), 1), ROWS_SHOWN) if terms.size() > 0 else 24.0
	column.add_child(scroll)

	if leaving != "":
		column.add_child(_leaving_warning(them))
	column.add_child(_meter(them, talks, closed_days))

	var bottom := HBoxContainer.new()
	bottom.add_theme_constant_override("separation", 10)
	bottom.add_child(_button("Cancel", "Cancel", "Esc", func() -> void: answered.emit(false)))
	var space := Control.new()
	space.size_flags_horizontal = SIZE_EXPAND_FILL
	bottom.add_child(space)
	var white := _button("White", "White peace", "", func() -> void: white_peace.emit())
	white.disabled = closed_days > 0
	bottom.add_child(white)
	var send := Style.primary_button("Send terms" if leaving == "" else "Send terms, leave %s" % leaving, 19)
	send.name = "Send"
	send.custom_minimum_size.y = 48
	send.disabled = closed_days > 0
	send.pressed.connect(func() -> void: answered.emit(true))
	bottom.add_child(send)
	column.add_child(bottom)
	column.add_child(_wrapped("If %s refuses, the war goes on, and it won't talk again for %d days." % [them,
		MwWorld.TALKS_CLOSED_DAYS], 13, Style.MUTED))
	_end(column)


## A separate peace: the player would leave its faction, whose other
## members fight on.
func _leaving_warning(them: String) -> PanelContainer:
	var box := PanelContainer.new()
	box.name = "Leaving"
	box.add_theme_stylebox_override("panel", Style.box(Color("2a1414"), Style.WAR_LINE, 8, 16, 12))
	var lines := VBoxContainer.new()
	lines.add_theme_constant_override("separation", 4)
	lines.add_child(Style.label("You would leave %s" % leaving, 19, Color("f0a49f"), Style.TITLE))
	lines.add_child(_wrapped("Other members are still at war with %s. Peace on your own takes you out of "
		% them + "%s: nobody defends you any more, and the others fight on." % leaving, 14,
		Color("e3c3c0"), WIDTH - 92))
	box.add_child(lines)
	return box


## The chance, as a meter with a word and a sentence on why.
func _meter(them: String, talks: Dictionary, closed_days: int) -> PanelContainer:
	var box := PanelContainer.new()
	box.name = "Meter"
	box.add_theme_stylebox_override("panel", Style.box(Color("121b27"), Color.TRANSPARENT, 8, 18, 14))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	var chance := float(talks.get("chance", 0.0))
	var head := HBoxContainer.new()
	var title := Style.label("Will %s accept?" % them, 20, Style.TEXT, Style.TITLE)
	title.size_flags_horizontal = SIZE_EXPAND_FILL
	head.add_child(title)
	var word := Style.label(verdict(chance), 15, verdict_color(chance), Style.BODY_STRONG)
	word.name = "Verdict"
	head.add_child(word)
	column.add_child(head)
	var bar := Meter.new()
	bar.value = chance
	bar.custom_minimum_size = Vector2(0, 20)
	column.add_child(bar)
	var ends := HBoxContainer.new()
	var left := Style.label("Will refuse", 12, Style.MUTED)
	left.size_flags_horizontal = SIZE_EXPAND_FILL
	ends.add_child(left)
	ends.add_child(Style.label("Will accept", 12, Style.MUTED))
	column.add_child(ends)
	var why := _wrapped(reason(them, talks), 14, Style.CREDIT)
	why.name = "Why"
	column.add_child(why)
	if closed_days > 0:
		column.add_child(_wrapped("%s refused your last terms: it talks again in %s." % [them,
			"1 day" if closed_days == 1 else "%d days" % closed_days], 14, Style.WAR))
	box.add_child(column)
	return box


## "Will accept", "Likely to accept", "It might refuse", "Likely to refuse"
## or "Will refuse".
static func verdict(chance: float) -> String:
	if chance >= 0.95:
		return "Will accept"
	if chance >= 0.6:
		return "Likely to accept"
	if chance >= 0.35:
		return "It might refuse"
	if chance > 0.05:
		return "Likely to refuse"
	return "Will refuse"


static func verdict_color(chance: float) -> Color:
	return Style.PEACE if chance >= 0.6 else (Style.ARROW if chance >= 0.35 else Style.WAR)


## Why it would or would not accept: what the terms ask and how its war
## goes.
static func reason(them: String, talks: Dictionary) -> String:
	var asked := float(talks.get("asked", 0.0))
	var held := float(talks.get("asked_held", 0.0))
	var lost := float(talks.get("lost", 0.0))
	var support := float(talks.get("support", 1.0))
	var ask := "You ask for nothing of %s's" % them
	if asked > 0.0:
		ask = "You ask for %d%% of what %s produces and hold %d%% of it" % [roundi(asked * 100.0), them,
			roundi(held * 100.0)]
	var war := "%s holds %d%% of its land and its war support is %d%%" % [them, roundi((1.0 - lost) * 100.0),
		roundi(support * 100.0)]
	var chance := float(talks.get("chance", 0.0))
	var mood := "so it would rather fight on." if chance < 0.5 else "so it is ready to stop."
	var text := "%s. %s, %s" % [ask, war, mood]
	if talks.get("separate", false):
		text += " Its allies fight on: peace on its own would cost it its faction, which halves the chance."
	return text


func _term_row(region: int, player: int, them: String, facts: Dictionary) -> PanelContainer:
	var row := PanelContainer.new()
	row.name = "Term%d" % region
	var style := StyleBoxFlat.new()
	style.bg_color = Color.TRANSPARENT
	style.border_color = Style.LINE
	style.border_width_top = 1
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	row.add_theme_stylebox_override("panel", style)
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 12)
	var yours := int(facts.get("owner", 0)) == player
	var swatch := Style.swatch(Color(Style.WAR if yours else Style.GOLD, 0.85), 14)
	swatch.size_flags_vertical = SIZE_SHRINK_BEGIN
	line.add_child(swatch)
	var texts := VBoxContainer.new()
	texts.add_theme_constant_override("separation", 2)
	texts.size_flags_horizontal = SIZE_EXPAND_FILL
	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 8)
	name_row.add_child(Style.label(scenario.region_name(region), 17))
	var held := float(facts.get("held", 0.0))
	var share := float(facts.get("share", 0.0))
	var detail := ""
	if yours:
		name_row.add_child(_tag("You give it up", Style.WAR, Style.WAR_LINE))
		detail = "%d%% of what you produce" % roundi(share * 100.0)
	else:
		if not facts.get("most", false):
			name_row.add_child(_tag("Not yours yet", Style.ARROW, Color("6b4220")))
		var hold := "You hold most of it" if facts.get("most", false) else \
			("You hold %d%% of it" % roundi(held * 100.0) if held > 0.0 else "You hold none of it")
		detail = "%s  ·  %d%% of what %s produces" % [hold, roundi(share * 100.0), them]
	texts.add_child(name_row)
	texts.add_child(Style.label(detail, 13, Style.MUTED))
	line.add_child(texts)
	var drop := Button.new()
	drop.name = "Drop"
	drop.text = "✕"
	drop.flat = true
	drop.focus_mode = FOCUS_NONE
	drop.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	drop.add_theme_color_override("font_color", Style.MUTED)
	drop.add_theme_color_override("font_hover_color", Style.TEXT)
	drop.size_flags_vertical = SIZE_SHRINK_CENTER
	drop.pressed.connect(func() -> void: dropped.emit(region))
	line.add_child(drop)
	row.add_child(line)
	return row


func _tag(text: String, color: Color, line: Color) -> Label:
	var tag := Style.label(text, 12, color)
	tag.add_theme_stylebox_override("normal", Style.box(Color.TRANSPARENT, line, 3, 6, 1))
	tag.size_flags_vertical = SIZE_SHRINK_CENTER
	return tag


func _top(kicker: String, title: String) -> VBoxContainer:
	var top := VBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	top.add_child(Style.label(kicker, 13, Style.MUTED, Style.spaced(Style.BODY, 1)))
	var heading := _wrapped(title, 36, Style.TEXT, WIDTH - 60, Style.TITLE)
	heading.name = "Title"
	top.add_child(heading)
	return top


func _begin() -> VBoxContainer:
	for child in dialog.get_children():
		dialog.remove_child(child) # gone now, so the new size is not the old one's
		child.queue_free()
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 18)
	return column


func _end(column: VBoxContainer) -> void:
	dialog.add_child(column)
	visible = true
	# Wrapped text knows its height only once laid out at its width.
	dialog.reset_size.call_deferred()


func _button(id: String, text: String, key: String, action: Callable) -> Control:
	var button := Style.tool_button(text, key)
	button.name = id
	button.custom_minimum_size.y = 48
	button.pressed.connect(action)
	return button


func _wrapped(text: String, size: int, color: Color, width := WIDTH - 60, font: Font = Style.BODY) -> Label:
	var label := Style.label(text, size, color, font)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size.x = width
	return label


## "Moselle, Meurthe-et-Moselle and Haut-Rhin", or the first few and a count.
func _names(names: PackedStringArray) -> String:
	if names.size() > MAX_NAMES:
		return "%s and %d more regions" % [", ".join(names.slice(0, MAX_NAMES)), names.size() - MAX_NAMES]
	return Style.list_and(names)


func _percent(share: float) -> String:
	return "%.1f%%" % (share * 100.0)


## A bar from red (will refuse) to green (will accept) with a mark at the
## chance.
class Meter extends Control:
	var value := 0.0

	func _draw() -> void:
		var top := size.y / 2.0 - 5.0
		var steps := 48
		for i in steps:
			var t := float(i) / (steps - 1)
			var color := Style.WAR.lerp(Style.ARROW, t * 2.0) if t < 0.5 else Style.ARROW.lerp(Style.PEACE, (t - 0.5) * 2.0)
			draw_rect(Rect2(size.x * i / steps, top, size.x / steps + 1.0, 10.0), color)
		var x := clampf(value, 0.0, 1.0) * (size.x - 4.0)
		draw_rect(Rect2(x - 2.0, 0, 8.0, size.y), Color("0d131c"))
		draw_rect(Rect2(x, 2.0, 4.0, size.y - 4.0), Style.TEXT)
