extends Control
## A card in the middle of the screen for a big event (a war declared on
## the player, a peace offer, a peace made, a capitulation). The game pauses
## while it is open; closing it lets the game run again if it was running.
## A peace offer has Refuse and Accept buttons; the rest has Continue.

signal closed(accepted: bool)

const Style := preload("res://ui/style.gd")
const WIDTH := 460.0

var card := PanelContainer.new()


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


## `kicker` is the small line above the title, `answer` whether the card
## asks to accept or refuse.
func show_event(kicker: String, title: String, body: String, answer: bool) -> void:
	for child in card.get_children():
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
	if answer:
		var refuse := Style.tool_button("Refuse", "N")
		refuse.pressed.connect(func() -> void: closed.emit(false))
		buttons.add_child(refuse)
		var accept := Style.primary_button("Accept peace", 18)
		accept.pressed.connect(func() -> void: closed.emit(true))
		buttons.add_child(accept)
	else:
		var go_on := Style.primary_button("Continue", 18)
		go_on.pressed.connect(func() -> void: closed.emit(true))
		buttons.add_child(go_on)
	column.add_child(buttons)
	card.add_child(column)
	card.reset_size()
	visible = true
