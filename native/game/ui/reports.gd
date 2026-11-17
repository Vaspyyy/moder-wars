extends PanelContainer
## The reports feed on the right: what happened to the player's country
## and its enemies, newest first, with the hour (or the day, for older
## lines). A line repeated in a row is counted ("×8") instead of shown again.

const Style := preload("res://ui/style.gd")
const WIDTH := 332.0
const LINES := 8

## Newest last: [text, date, hour, tone, count].
var entries: Array = []
var list := VBoxContainer.new()


func setup() -> void:
	Style.solid(self)
	set_anchors_preset(PRESET_TOP_RIGHT)
	grow_horizontal = GROW_DIRECTION_BEGIN
	position = Vector2(-16, 76)
	custom_minimum_size.x = WIDTH
	add_theme_stylebox_override("panel", Style.box(Color(Style.PANEL, 0.94), Style.LINE, 8, 16, 16))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	column.add_child(Style.label("Reports", 20, Style.TEXT, Style.spaced(Style.TITLE, 1)))
	list.add_theme_constant_override("separation", 10)
	column.add_child(list)
	add_child(column)
	_show("")


## Add reports from MwWorld.take_reports (the ones meant for the player).
func add(reports: Array, today: String) -> void:
	var changed := false
	for report in reports:
		if not report["mine"]:
			continue
		var text := String(report["text"])
		if not entries.is_empty() and entries[-1][0] == text:
			entries[-1][1] = report["date"]
			entries[-1][2] = report["hour"]
			entries[-1][4] += 1
		else:
			entries.append([text, String(report["date"]), int(report["hour"]), String(report["tone"]), 1])
		changed = true
	if entries.size() > LINES:
		entries = entries.slice(entries.size() - LINES)
	if changed or list.get_child_count() == 0:
		_show(today)


## Forget every report (a loaded game has its own past).
func clear() -> void:
	entries.clear()
	_show("")


func _show(today: String) -> void:
	for child in list.get_children():
		child.queue_free()
	if entries.is_empty():
		list.add_child(Style.label("Nothing to report yet.", 14, Style.MUTED))
		return
	for i in range(entries.size() - 1, -1, -1):
		var entry: Array = entries[i]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		var when := "%02d:00" % entry[2] if entry[1] == today else _short_date(entry[1])
		var time := Style.label(when, 14, Style.MUTED)
		time.custom_minimum_size.x = 44
		time.size_flags_vertical = SIZE_SHRINK_BEGIN
		row.add_child(time)
		var color := Style.TEXT
		if entry[3] == "war":
			color = Style.WAR
		elif entry[3] == "peace":
			color = Style.PEACE
		var text := Style.label(entry[0] + ("  ×%d" % entry[4] if entry[4] > 1 else ""), 14, color)
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		text.custom_minimum_size.x = WIDTH - 32 - 44 - 12
		row.add_child(text)
		list.add_child(row)
	reset_size()


## "2026-10-21" -> "21 Oct".
func _short_date(iso: String) -> String:
	var parts := iso.split("-")
	if parts.size() < 3:
		return iso
	return "%d %s" % [int(parts[2]), Style.MONTHS[clampi(int(parts[1]) - 1, 0, 11)].left(3)]
