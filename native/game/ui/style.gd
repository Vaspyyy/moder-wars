extends RefCounted
## Colors, fonts and boxes shared by every screen, taken from the approved
## mockups: dark blue-grey panels over the map, light text, gold for what
## the player acts with, orange for attack arrows, red for war.

const PANEL := Color(0.051, 0.075, 0.110, 0.92)
const PANEL_SOLID := Color(0.051, 0.075, 0.110, 0.95)
const LINE := Color("243142")
const LINE_STRONG := Color("2e3d52")
const TEXT := Color("e9eef4")
const MUTED := Color("9aa7b8")
const CREDIT := Color("c3cdd9")
const GOLD := Color("f2b544")
const GOLD_HOVER := Color("ffd27a")
const ON_GOLD := Color("1a1305")
const ARROW := Color("ff7a2f")
const WAR := Color("e5534b")
const WAR_LINE := Color("5c2a28")
const PEACE := Color("6fbf8a")
const PEACE_LINE := Color("2c4a37")
const BUTTON := Color("1a2433")
const BUTTON_HOVER := Color("243142")
const OFF := Color("3a4a60")

const BODY := preload("res://fonts/Barlow-Regular.ttf")
const BODY_MEDIUM := preload("res://fonts/Barlow-Medium.ttf")
const BODY_STRONG := preload("res://fonts/Barlow-SemiBold.ttf")
const TITLE := preload("res://fonts/BarlowCondensed-SemiBold.ttf")
const TITLE_BOLD := preload("res://fonts/BarlowCondensed-Bold.ttf")

const MONTHS := ["January", "February", "March", "April", "May", "June", "July",
	"August", "September", "October", "November", "December"]


## A flat box: fill, a one-pixel line, round corners and inner padding.
static func box(fill: Color, line: Color = Color.TRANSPARENT, radius := 6,
		pad_x := 0, pad_y := 0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	if line.a > 0.0:
		style.border_color = line
		style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.content_margin_left = pad_x
	style.content_margin_right = pad_x
	style.content_margin_top = pad_y
	style.content_margin_bottom = pad_y
	style.anti_aliasing = radius > 0
	return style


## The panel every floating box on the map uses.
static func panel(pad_x := 16, pad_y := 12, line: Color = LINE, radius := 6) -> StyleBoxFlat:
	return box(PANEL, line, radius, pad_x, pad_y)


static func label(text: String, size := 16, color: Color = TEXT, font: Font = BODY) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


## A font with extra space between letters, for the game's name.
static func spaced(font: Font, spacing: int) -> FontVariation:
	var variation := FontVariation.new()
	variation.base_font = font
	variation.spacing_glyph = spacing
	return variation


## A gold button for the main action of a screen.
static func primary_button(text: String, size := 20) -> Button:
	var button := Button.new()
	button.text = text
	button.add_theme_font_override("font", TITLE_BOLD)
	button.add_theme_font_size_override("font_size", size)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state, ON_GOLD)
	button.add_theme_stylebox_override("normal", box(GOLD, Color.TRANSPARENT, 6, 26, 10))
	button.add_theme_stylebox_override("hover", box(GOLD_HOVER, Color.TRANSPARENT, 6, 26, 10))
	button.add_theme_stylebox_override("pressed", box(GOLD.darkened(0.1), Color.TRANSPARENT, 6, 26, 10))
	button.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	return button


## A small square in a country's map color.
static func swatch(color: Color, size := 18) -> Panel:
	var square := Panel.new()
	square.custom_minimum_size = Vector2(size, size)
	square.add_theme_stylebox_override("panel", box(color, Color(0, 0, 0, 0.4), 3))
	square.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return square


## 1234567 -> "1,234,567".
static func thousands(value: int) -> String:
	var text := str(absi(value))
	var out := ""
	while text.length() > 3:
		out = "," + text.right(3) + out
		text = text.left(text.length() - 3)
	return ("-" if value < 0 else "") + text + out


## A count of people in words: "36.8 million", "512,000".
static func people(value: int) -> String:
	if value >= 1_000_000_000:
		return "%.2f billion" % (value / 1e9)
	if value >= 1_000_000:
		return "%.1f million" % (value / 1e6)
	return thousands(value)


## Thousands of dollars in words: "$696 billion", "$1.2 trillion".
static func dollars_k(value_k: int) -> String:
	var dollars := value_k * 1000.0
	if dollars >= 1e12:
		return "$%.1f trillion" % (dollars / 1e12)
	if dollars >= 1e10:
		return "$%d billion" % roundi(dollars / 1e9)
	if dollars >= 1e9:
		return "$%.1f billion" % (dollars / 1e9)
	return "$%d million" % roundi(dollars / 1e6)


## "2026-10-21" -> "21 October 2026" (empty stays empty).
static func long_date(iso: String) -> String:
	var parts := iso.split("-")
	if parts.size() < 3:
		return iso
	return "%d %s %s" % [int(parts[2]), MONTHS[clampi(int(parts[1]) - 1, 0, 11)], parts[0]]


## "Germany, France and Italy".
static func list_and(names: PackedStringArray) -> String:
	if names.size() <= 1:
		return "".join(names)
	return ", ".join(names.slice(0, names.size() - 1)) + " and " + names[-1]


## "1st", "2nd", "3rd", "11th", "22nd".
static func ordinal(n: int) -> String:
	var suffix := "th"
	if n % 100 < 11 or n % 100 > 13:
		suffix = ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]
	return "%d%s" % [n, suffix]


## A dark button with an optional line icon ("front" or "arrow") and a key
## shown in a small box, as in the command bar.
static func tool_button(text: String, key: String, icon := "") -> ToolButton:
	var button := ToolButton.new()
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if icon != "":
		var drawn := LineIcon.new()
		drawn.kind = icon
		drawn.custom_minimum_size = Vector2(20, 12)
		drawn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(drawn)
	var caption := label(text, 15)
	caption.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(caption)
	var badge := label(key, 12, MUTED)
	badge.add_theme_stylebox_override("normal", box(Color.TRANSPARENT, OFF, 3, 5, 1))
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(badge)
	button.add_child(row)
	return button


## A panel that acts as a button: it grows to fit what it holds (a Button
## does not), lightens under the mouse and sends `pressed` on a left click.
class ToolButton extends PanelContainer:
	signal pressed

	var disabled := false:
		set(value):
			disabled = value
			modulate.a = 0.45 if value else 1.0
			mouse_default_cursor_shape = CURSOR_ARROW if value else CURSOR_POINTING_HAND
	## Drawn with a gold frame (the chosen one of several).
	var chosen := false:
		set(value):
			chosen = value
			_restyle()
	## No fill or frame until the mouse is over it.
	var flat := false:
		set(value):
			flat = value
			_restyle()
	var padding := Vector2(14, 0):
		set(value):
			padding = value
			_restyle()
	var _hover := false

	func _init() -> void:
		custom_minimum_size.y = 44
		mouse_default_cursor_shape = CURSOR_POINTING_HAND
		mouse_entered.connect(func() -> void:
			_hover = true
			_restyle())
		mouse_exited.connect(func() -> void:
			_hover = false
			_restyle())
		_restyle()

	func _restyle() -> void:
		# Inner classes cannot call the outer `box`, so the box is made here.
		var style := StyleBoxFlat.new()
		var lit := _hover and not disabled
		if flat:
			style.bg_color = BUTTON if lit else Color.TRANSPARENT
		else:
			style.bg_color = BUTTON_HOVER if lit else (Color("1e2632") if chosen else Color("161f2c"))
			style.border_color = GOLD if chosen else LINE_STRONG
			style.set_border_width_all(1)
		style.set_corner_radius_all(6 if not flat else 4)
		style.content_margin_left = padding.x
		style.content_margin_right = padding.x
		style.content_margin_top = padding.y
		style.content_margin_bottom = padding.y
		add_theme_stylebox_override("panel", style)

	func _gui_input(event: InputEvent) -> void:
		var click := event as InputEventMouseButton
		if click and click.pressed and click.button_index == MOUSE_BUTTON_LEFT:
			accept_event()
			if not disabled:
				pressed.emit()


## Small line pictures: "front" (a gold zigzag), "arrow" (an orange arrow).
class LineIcon extends Control:
	var kind := "front"
	var color := Color.TRANSPARENT

	func _draw() -> void:
		var w := size.x
		var h := size.y
		if kind == "arrow":
			var tint := color if color.a > 0.0 else Color("ff7a2f")
			draw_line(Vector2(1, h / 2), Vector2(w - 3, h / 2), tint, 2.4, true)
			draw_polyline(PackedVector2Array([Vector2(w - 8, 1), Vector2(w - 2, h / 2),
				Vector2(w - 8, h - 1)]), tint, 2.4, true)
		else:
			var tint := color if color.a > 0.0 else Color("f2b544")
			draw_polyline(PackedVector2Array([Vector2(1, h * 0.75), Vector2(w * 0.25, h * 0.25),
				Vector2(w * 0.45, h * 0.67), Vector2(w * 0.65, h * 0.17), Vector2(w - 1, h * 0.75)]),
				tint, 2.4, true)


## A slider from 0 to 100 in the mockup's look: a thin dark track, gold up
## to the handle, a round gold handle.
static func slider() -> HSlider:
	var bar := HSlider.new()
	bar.min_value = 0
	bar.max_value = 100
	bar.step = 1
	bar.focus_mode = Control.FOCUS_NONE
	bar.custom_minimum_size.y = 24
	bar.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var track := box(LINE, Color.TRANSPARENT, 3)
	track.content_margin_top = 3
	track.content_margin_bottom = 3
	bar.add_theme_stylebox_override("slider", track)
	var filled := box(GOLD, Color.TRANSPARENT, 3)
	bar.add_theme_stylebox_override("grabber_area", filled)
	bar.add_theme_stylebox_override("grabber_area_highlight", box(GOLD_HOVER, Color.TRANSPARENT, 3))
	var knob := _circle(16, GOLD)
	bar.add_theme_icon_override("grabber", knob)
	bar.add_theme_icon_override("grabber_highlight", _circle(16, GOLD_HOVER))
	return bar


static func _circle(diameter: int, color: Color) -> ImageTexture:
	var image := Image.create(diameter, diameter, false, Image.FORMAT_RGBA8)
	var center := Vector2(diameter, diameter) / 2.0
	for y in diameter:
		for x in diameter:
			var d := Vector2(x + 0.5, y + 0.5).distance_to(center)
			var edge := clampf(center.x - d, 0.0, 1.0)
			image.set_pixel(x, y, Color(color, edge))
	return ImageTexture.create_from_image(image)


## A thin bar showing a share, in `color`.
static func share_bar(share: float, color: Color) -> Control:
	var bar := ShareBar.new()
	bar.share = share
	bar.color = color
	bar.custom_minimum_size.y = 6
	return bar


class ShareBar extends Control:
	var share := 0.0
	var color := Color.WHITE

	func _init() -> void:
		mouse_filter = MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var back := StyleBoxFlat.new()
		back.bg_color = LINE
		back.set_corner_radius_all(3)
		draw_style_box(back, Rect2(Vector2.ZERO, size))
		if share > 0.0:
			var front := StyleBoxFlat.new()
			front.bg_color = color
			front.set_corner_radius_all(3)
			draw_style_box(front, Rect2(Vector2.ZERO, Vector2(size.x * clampf(share, 0.0, 1.0), size.y)))
