extends PanelContainer
## The budget and mobilization window. Income comes first (what the land
## produces, less what mobilization costs). Two sliders set the shares for
## recruiting and equipment; the home front gets the rest, so the three
## always add up to 100%. Four buttons set the mobilization level, with
## the people who may still be drafted below. Changes apply at once, even
## while paused. Esc or the close button shuts it.

signal budget_changed(recruiting: int, equipment: int)
signal mobilization_changed(level: int)
signal close_pressed

const Style := preload("res://ui/style.gd")
const WIDTH := 760.0
const LEVEL_NAMES := ["Peacetime", "Partial", "General", "Total"]

var scenario: MwScenario
var palette: Image
var levels: Array = MwWorld.mobilization_levels()
var swatch: Panel
var title: Label
var output: Label
var mobilization_name: Label
var mobilization_cost: Label
var income: Label
var recruiting := Style.slider()
var equipment := Style.slider()
var shares := {}
var notes := {}
var home_bar: Control
var level_buttons: Array = []
var draft_text: Label
var draft_bar: Control
var economy: Dictionary = {}


func setup() -> void:
	set_anchors_preset(PRESET_CENTER_TOP)
	grow_horizontal = GROW_DIRECTION_BOTH
	offset_top = 96
	custom_minimum_size.x = WIDTH
	add_theme_stylebox_override("panel", Style.box(Color("0d131c"), Style.LINE_STRONG, 10, 32, 28))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 24)
	add_child(column)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	swatch = Style.swatch(Color.GRAY)
	swatch.size_flags_vertical = SIZE_SHRINK_CENTER
	header.add_child(swatch)
	title = Style.label("", 30, Style.TEXT, Style.TITLE)
	title.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(title)
	var close := Style.tool_button("Close", "Esc")
	close.pressed.connect(func() -> void: close_pressed.emit())
	header.add_child(close)
	column.add_child(header)

	var money := GridContainer.new()
	money.columns = 2
	money.add_theme_constant_override("v_separation", 8)
	var muted_line := func(text: String) -> Label:
		var line := Style.label(text, 16, Style.MUTED)
		line.size_flags_horizontal = SIZE_EXPAND_FILL
		return line
	money.add_child(muted_line.call("Output of the land you hold"))
	output = Style.label("", 16)
	output.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	money.add_child(output)
	mobilization_name = muted_line.call("")
	money.add_child(mobilization_name)
	mobilization_cost = Style.label("", 16, Style.WAR)
	mobilization_cost.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	money.add_child(mobilization_cost)
	var income_name := Style.label("Income", 16, Style.TEXT, Style.BODY_STRONG)
	income_name.size_flags_horizontal = SIZE_EXPAND_FILL
	money.add_child(income_name)
	income = Style.label("", 22, Style.TEXT, Style.TITLE)
	income.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	money.add_child(income)
	var money_box := PanelContainer.new()
	var underline := Style.box(Color.TRANSPARENT, Color.TRANSPARENT, 0, 0, 0)
	underline.border_color = Style.LINE
	underline.border_width_bottom = 1
	underline.content_margin_bottom = 20
	money_box.add_theme_stylebox_override("panel", underline)
	money_box.add_child(money)
	column.add_child(money_box)

	var budget := VBoxContainer.new()
	budget.add_theme_constant_override("separation", 18)
	budget.add_child(Style.label("Budget", 20, Style.TEXT, Style.spaced(Style.TITLE, 1)))
	budget.add_child(_share_row("Recruiting", recruiting))
	budget.add_child(_share_row("Equipment", equipment))
	home_bar = Style.share_bar(0.0, Color("6f8199"))
	home_bar.size_flags_vertical = SIZE_SHRINK_CENTER
	budget.add_child(_share_row("Home front", home_bar))
	column.add_child(budget)
	recruiting.value_changed.connect(func(value: float) -> void: _slide(int(value), true))
	equipment.value_changed.connect(func(value: float) -> void: _slide(int(value), false))

	var mobilization := VBoxContainer.new()
	mobilization.add_theme_constant_override("separation", 12)
	mobilization.add_child(Style.label("Mobilization", 20, Style.TEXT, Style.spaced(Style.TITLE, 1)))
	var level_row := HBoxContainer.new()
	level_row.add_theme_constant_override("separation", 8)
	for level in levels.size():
		var button := _level_button(level)
		level_buttons.append(button)
		level_row.add_child(button)
	mobilization.add_child(level_row)
	var draft_line := HBoxContainer.new()
	var draft_name := Style.label("Can still draft", 14, Style.MUTED)
	draft_name.size_flags_horizontal = SIZE_EXPAND_FILL
	draft_line.add_child(draft_name)
	draft_text = Style.label("", 14)
	draft_line.add_child(draft_text)
	mobilization.add_child(draft_line)
	draft_bar = Style.share_bar(0.0, Style.GOLD)
	mobilization.add_child(draft_bar)
	column.add_child(mobilization)

	var footer := Style.label("Changes apply at once, even while paused. A division costs $%d bn and %s people; soldiers lost do not come back." % [
		MwWorld.DIVISION_COST_K / 1_000_000, Style.thousands(MwWorld.DIVISION_SIZE)], 13, Style.MUTED)
	footer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	footer.custom_minimum_size.x = WIDTH - 64
	column.add_child(footer)


## A row: name, control (slider or bar), percent, and a note under it.
func _share_row(name: String, control: Control) -> GridContainer:
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 4)
	var label := Style.label(name, 16)
	label.custom_minimum_size.x = 150
	grid.add_child(label)
	control.size_flags_horizontal = SIZE_EXPAND_FILL
	grid.add_child(control)
	var share := Style.label("", 20, Style.TEXT, Style.TITLE)
	share.custom_minimum_size.x = 56
	share.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	grid.add_child(share)
	shares[name] = share
	grid.add_child(Control.new())
	var note := Style.label("", 13, Style.MUTED)
	grid.add_child(note)
	notes[name] = note
	grid.add_child(Control.new())
	return grid


func _level_button(level: int) -> PanelContainer:
	var button := Style.ToolButton.new()
	button.custom_minimum_size = Vector2((WIDTH - 64 - 24) / 4, 64)
	button.padding = Vector2(10, 10)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	column.mouse_filter = MOUSE_FILTER_IGNORE
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(Style.label(LEVEL_NAMES[level], 15, Style.TEXT, Style.BODY_STRONG))
	var serve := float(levels[level]["serve_per_mille"]) / 10.0
	var loss := int(levels[level]["output_loss_percent"])
	var cost := "no cost" if loss == 0 else "−%d%% output" % loss
	column.add_child(Style.label("%s%% may serve  ·  %s" % [String.num(serve, 1).trim_suffix(".0"), cost],
		13, Style.MUTED))
	button.add_child(column)
	button.pressed.connect(func() -> void: mobilization_changed.emit(level))
	return button


## Keep the shares at most 100% together: moving one slider past what the
## other leaves pushes the other down. Then send the new budget.
func _slide(value: int, is_recruiting: bool) -> void:
	var other := equipment if is_recruiting else recruiting
	if value + int(other.value) > 100:
		other.set_value_no_signal(100 - value)
	budget_changed.emit(int(recruiting.value), int(equipment.value))


## Show a country's economy (MwWorld.economy).
func show_economy(country: int, data: Dictionary) -> void:
	economy = data
	swatch.add_theme_stylebox_override("panel", Style.box(palette.get_pixel(country, 0), Color(0, 0, 0, 0.6), 3))
	title.text = "%s  ·  Economy" % scenario.country_name(country)
	var level := int(data["mobilization"])
	var output_k := int(data["output_k"])
	var income_k := int(data["income_k"])
	output.text = _per_day(output_k)
	mobilization_name.text = "%s mobilization" % LEVEL_NAMES[level] if level > 0 else "Peacetime"
	var loss := int(levels[level]["output_loss_percent"])
	mobilization_cost.text = "no cost" if loss == 0 else "−%d%%  ·  −$%.2f bn" % [loss, (output_k - income_k) / 1e6]
	mobilization_cost.add_theme_color_override("font_color", Style.MUTED if loss == 0 else Style.WAR)
	income.text = _per_day(income_k)
	var r := int(data["recruiting"])
	var e := int(data["equipment"])
	var home := int(data["home_front"])
	recruiting.set_value_no_signal(r)
	equipment.set_value_no_signal(e)
	shares["Recruiting"].text = "%d%%" % r
	shares["Equipment"].text = "%d%%" % e
	shares["Home front"].text = "%d%%" % home
	home_bar.share = home / 100.0
	home_bar.queue_redraw()
	notes["Recruiting"].text = "%s  ·  %s" % [_per_day(income_k * r / 100),
		_recruits(income_k * r / 100, int(data["manpower"]))]
	notes["Equipment"].text = "%s  ·  equips recruits and repairs worn divisions" % _per_day(income_k * e / 100)
	notes["Home front"].text = "%s  ·  what is left goes to the people and holds up war support (%d%%)" % [
		_per_day(income_k * home / 100), roundi(int(data["support"]) / 10.0)]
	for i in level_buttons.size():
		var chosen := i == level
		var button: PanelContainer = level_buttons[i]
		button.chosen = chosen
		var column := button.get_child(0)
		column.get_child(0).add_theme_color_override("font_color", Style.GOLD if chosen else Style.TEXT)
		column.get_child(1).add_theme_color_override("font_color", Style.CREDIT if chosen else Style.MUTED)
	var may_serve := maxi(1, int(data["may_serve"]))
	var left := int(data["manpower"])
	draft_text.text = "%s of %s" % [Style.thousands(left), Style.thousands(may_serve)]
	draft_bar.share = float(left) / may_serve
	draft_bar.queue_redraw()


## What a recruiting budget raises a day.
func _recruits(per_day_k: int, manpower: int) -> String:
	if manpower < MwWorld.DIVISION_SIZE:
		return "no one left to draft at this mobilization"
	if per_day_k <= 0:
		return "no new divisions"
	var per_day := float(per_day_k) / MwWorld.DIVISION_COST_K
	if per_day >= MwWorld.RECRUITS_PER_DAY:
		return "about %d new divisions a day, the most allowed" % MwWorld.RECRUITS_PER_DAY
	if per_day >= 1.0:
		return "about 1 new division a day"
	return "a new division about every %d days" % ceili(1.0 / per_day)


func _per_day(value_k: int) -> String:
	return "%s a day" % _bn(value_k)


func _bn(value_k: int) -> String:
	return "$%.2f bn" % (value_k / 1e6)
