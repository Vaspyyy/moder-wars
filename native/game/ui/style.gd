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
