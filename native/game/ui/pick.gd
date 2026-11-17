extends Control
## The first screen: the world, paused, and a card about the country the
## player clicked, with a button to lead it.

signal lead_pressed(country: int)

const Style := preload("res://ui/style.gd")
const CountryCard := preload("res://ui/country_card.gd")

var scenario: MwScenario
var palette: Image
## Map world position -> screen position.
var to_screen: Callable
var country := 0
var card := CountryCard.new()


func setup(start_date: String) -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	mouse_filter = MOUSE_FILTER_IGNORE

	var title := PanelContainer.new()
	title.add_theme_stylebox_override("panel", Style.panel(18, 14))
	title.position = Vector2(24, 20)
	var title_lines := VBoxContainer.new()
	title_lines.add_theme_constant_override("separation", 4)
	title_lines.add_child(Style.label("MODERN WARS", 22, Style.TEXT, Style.spaced(Style.TITLE_BOLD, 3)))
	var subtitle := scenario.scenario_name()
	if start_date != "":
		subtitle += "  ·  starts " + Style.long_date(start_date)
	title_lines.add_child(Style.label(subtitle, 14, Style.MUTED))
	title.add_child(title_lines)
	Style.solid(title)
	add_child(title)

	var paused := PanelContainer.new()
	paused.add_theme_stylebox_override("panel", Style.panel(16, 10))
	paused.set_anchors_preset(PRESET_TOP_RIGHT)
	paused.grow_horizontal = GROW_DIRECTION_BEGIN
	paused.position = Vector2(-24, 20)
	var paused_row := HBoxContainer.new()
	paused_row.add_theme_constant_override("separation", 10)
	var icon := PauseIcon.new()
	icon.custom_minimum_size = Vector2(14, 14)
	icon.size_flags_vertical = SIZE_SHRINK_CENTER
	paused_row.add_child(icon)
	paused_row.add_child(Style.label("PAUSED", 18, Style.TEXT, Style.spaced(Style.TITLE, 1)))
	paused.add_child(paused_row)
	Style.solid(paused)
	add_child(paused)

	var hint := PanelContainer.new()
	hint.add_theme_stylebox_override("panel", Style.panel(16, 12))
	hint.set_anchors_preset(PRESET_BOTTOM_LEFT)
	hint.grow_vertical = GROW_DIRECTION_BEGIN
	hint.position = Vector2(24, -20)
	var hint_lines := VBoxContainer.new()
	hint_lines.add_theme_constant_override("separation", 4)
	hint_lines.add_child(Style.label(
		"Click any country to lead it. The game starts paused, so you can plan first.", 15))
	hint_lines.add_child(Style.label(
		"Every other country is played by the AI, with the same orders you have.", 13, Style.MUTED))
	hint.add_child(hint_lines)
	Style.solid(hint)
	add_child(hint)

	card.scenario = scenario
	card.palette = palette
	card.to_screen = to_screen
	card.setup()
	add_child(card)


## Show the card for a country clicked at a map world position (0 hides it).
func show_country(id: int, world_spot: Vector2, info: Dictionary) -> void:
	country = id
	var lead := func() -> void: lead_pressed.emit(country)
	card.show_country(id, world_spot, info, "",
		[["Lead " + scenario.country_name(id), true, lead]] if id > 0 else [], "or click another country")


## Two gold bars.
class PauseIcon extends Control:
	func _draw() -> void:
		var bar := Vector2(size.x * 0.25, size.y * 0.86)
		var top := size.y * 0.07
		draw_rect(Rect2(Vector2(size.x * 0.14, top), bar), Style.GOLD)
		draw_rect(Rect2(Vector2(size.x * 0.61, top), bar), Style.GOLD)
