extends Control
## A card in the middle of the screen for a big event (a war declared on
## the player, a peace made, a capitulation). The game pauses while it is
## open; Continue closes it. A choice (a call to arms, an invitation into a
## faction) has two buttons instead and says which was pressed. (Peace
## offers get the peace window instead.)

signal closed
signal chosen(yes: bool)

const Style := preload("res://ui/style.gd")
const WIDTH := 460.0

var card := PanelContainer.new()
## Whether the card shown asks a yes or no (`show_choice`).
var choice := false


func setup() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	Style.solid(self)
	var shade := ColorRect.new()
	shade.color = Color(0.02, 0.04, 0.07, 0.45)
	shade.set_anchors_preset(PRESET_FULL_RECT)
	add_child(shade)
	card.set_anchors_preset(PRESET_CENTER)
	card.grow_horizontal = GROW_DIRECTION_BOTH
	card.grow_vertical = GROW_DIRECTION_BOTH
	card.custom_minimum_size.x = WIDTH
	card.add_theme_stylebox_override("panel", Style.box(Color(Style.PANEL, 0.97), Style.LINE_STRONG, 8, 26, 24))
	add_child(card)


## `kicker` is the small line above the title.
func show_event(kicker: String, title: String, body: String) -> void:
	var buttons := _begin(kicker, title, body)
	var go_on := Style.primary_button("Continue", 18)
	go_on.pressed.connect(func() -> void: closed.emit())
	buttons.add_child(go_on)
	choice = false
	card.reset_size()
	visible = true


## A yes or no: `no` and `yes` are [text, key] for the two buttons.
func show_choice(kicker: String, title: String, body: String, no: Array, yes: Array) -> void:
	var buttons := _begin(kicker, title, body)
	var refuse := Style.tool_button(no[0], no[1])
	refuse.name = "No"
	refuse.custom_minimum_size.y = 48
	refuse.pressed.connect(func() -> void: chosen.emit(false))
	buttons.add_child(refuse)
	var accept := Style.primary_button("%s  (%s)" % yes, 18)
	accept.name = "Yes"
	accept.custom_minimum_size.y = 48
	accept.pressed.connect(func() -> void: chosen.emit(true))
	buttons.add_child(accept)
	choice = true
	card.reset_size()
	visible = true


## The kicker, title and text; returns the row for the buttons.
func _begin(kicker: String, title: String, body: String) -> HBoxContainer:
	for child in card.get_children():
		card.remove_child(child) # gone now, so the new size is not the old one's
		child.queue_free()
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	column.add_child(Style.label(kicker + "  ·  THE GAME IS PAUSED", 12, Style.MUTED,
		Style.spaced(Style.BODY_STRONG, 1)))
	var heading := Style.label(title, 32, Style.TEXT, Style.TITLE)
	heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	heading.custom_minimum_size.x = WIDTH - 52
	column.add_child(heading)
	var text := Style.label(body, 16, Style.CREDIT)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.custom_minimum_size.x = WIDTH - 52
	column.add_child(text)
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_END
	buttons.add_theme_constant_override("separation", 12)
	column.add_child(buttons)
	card.add_child(column)
	return buttons
