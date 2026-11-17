extends Node2D
## The game: loads a real scenario through the Rust extension, draws the
## political map with a shader and runs the simulation on it. It opens on
## the pick screen (every country with its real army, paused): click a
## country, then "Lead" it; the AI runs every other country. --war without
## --lead opens the viewer instead, where any country's divisions take orders.
## Pan by dragging with any mouse button or with WASD/arrows, zoom with the
## wheel or +/-. Space pauses and resumes, 1-5 set the speed.
##
## Armies: click a division to select it (only your own while you lead a
## country; Shift+drag selects all in a box, Ctrl+A all of yours, and the
## army group list has a row for divisions in no group), or its whole army
## group if it is in
## one (Shift-click adds or removes single divisions). G makes the selection an
## army group. F then a left-drag draws the selected group's front along a
## border; R then a left-drag draws its arrow into enemy land; X removes the
## arrow. Right-click sends the selected divisions somewhere directly, which
## takes them out of their group. Esc cancels drawing, then clears the
## selection, and with nothing left to close opens the pause menu (Continue,
## Saves, New game, Quit to desktop). Orders take effect at once, even
## while paused. F5 and F9 save and load the quick save.
##
## The stand-in controls below act for the country you lead, or in the viewer
## for the selected division's country.
## Economy: while leading a country, B or M (or a click on income or people
## left to draft in the top bar) opens the budget and mobilization window; in
## the viewer B cycles the budget (peace, war, all-out) and M the
## mobilization level.
## AI: I hands the country to the AI or takes it back (with --ai both sides
## of the sandbox war start on the AI).
## War and peace (stand-in controls): Shift+W declares war on the country
## under the mouse (W alone pans), P offers peace to all enemies, and Y or N
## accepts or refuses the newest open peace offer (made to you while you lead
## a country).
##
## Command-line options (after `--`):
##   --scenario=<name>        package in assets/maps/compiled (default world-map-2026-v3)
##   --lead=<country>         skip the pick screen and lead this country
##   --pick=<country>         on the pick screen, show this country's card (for screenshots)
##   --view=<lng>,<lat>,<zoom> start the camera here
##   --war=<attacker>,<defender>[,<attackers>,<defenders>]
##                            sandbox war along their border, with that many
##                            divisions a side (default 24 and 12)
##   --seed=<n>               simulation seed (default 1)
##   --speed=<1-5>            starting speed
##   --play                   start running (the game starts paused)
##   --ai                     hand both sides of the --war sandbox to the AI
##   --forces                 with --war: every country starts with its real army
##                            (World Bank data, always on without --war) and --war
##                            only declares the war
##   --run=<hours>            run the simulation this long before showing it
##   --select=<id>,...        select these divisions, or their army groups (for screenshots)
##   --screenshot=<path>      save one frame as PNG and quit (for headless checks)
##   --no-hud                 hide the labels except the data credits (clean map pictures)
##   --probe=<lng>,<lat>;...  print the country and region under each point and quit
##   --hover=<lng>,<lat>      show the hover label for this point (for screenshots)

const MAX_LAT := 85.0511
const ZOOM_MIN := 0.25
const ZOOM_MAX := 40.0
## A press that moves less than this many pixels is a click, not a drag.
const CLICK_SLOP := 5.0
const FEED_LINES := 6
## Seconds between uploads of the control map to the GPU while it changes.
const CONTROL_UPLOAD_EVERY := 0.15
## Budget presets for B: [recruiting %, equipment %] and their names.
const BUDGETS := [[0, 10], [25, 15], [50, 20]]
const BUDGET_NAMES := ["peace budget", "war budget", "all-out budget"]
const MOBILIZATION_NAMES := ["peacetime", "partial mobilization", "general mobilization",
	"total mobilization"]
## How far the camera zooms in on the capital when the player takes a country.
const LEAD_ZOOM := 5.0
const Style := preload("res://ui/style.gd")
const PickScreen := preload("res://ui/pick.gd")
const TopBar := preload("res://ui/top_bar.gd")
const ArmyGroups := preload("res://ui/army_groups.gd")
const Reports := preload("res://ui/reports.gd")
const CommandBar := preload("res://ui/command_bar.gd")
const MapKey := preload("res://ui/map_key.gd")
const EventCard := preload("res://ui/event_card.gd")
const EconomyWindow := preload("res://ui/economy.gd")
const PeaceWindow := preload("res://ui/peace.gd")
const CountryCard := preload("res://ui/country_card.gd")
const PauseMenu := preload("res://ui/pause_menu.gd")
const DefeatScreen := preload("res://ui/defeat.gd")
const Lines := preload("res://ui/lines.gd")
const SaveSlots := preload("res://saves.gd")
const Scenarios := preload("res://scenarios.gd")

## New game starts the scene again with these options instead of the
## command line's (only the scenario), so it opens on the pick screen.
static var restart_args := {}

var scenario := MwScenario.new()
var sim := MwWorld.new()
var owners: Image
var owners_texture: ImageTexture
var palette: Image
var regions: Image
var map_size := Vector2.ZERO
var map_rect := ColorRect.new()
var camera := Camera2D.new()
var info := Label.new()
var credit := Label.new()
var clock := Label.new()
var feed := Label.new()
var details := Label.new()
var help := Label.new()
var markers := preload("res://divisions.gd").new()
## Recent event lines as [text, times]; repeats in a row are counted.
var feed_lines: Array = []
var control_dirty := false
var since_upload := 0.0
var press_at := Vector2.ZERO
## "front" or "arrow" while waiting for or drawing a line, else "".
var drawing := ""
## The line being drawn, as (longitude, latitude) points.
var stroke_points := PackedVector2Array()
var hovered_id := -1
var hovered_region := -1
var dragging := false
## Shift+drag: the box being drawn to select divisions, from this corner.
var boxing := false
## Esc dropped the box; its release then does nothing.
var box_cancelled := false
var box_from := Vector2.ZERO
var select_box := Panel.new()
var ui_layer := CanvasLayer.new()
var no_hud := false
## The country the player leads, or 0 (pick screen or viewer).
var player := 0
## Where quick saves go: Godot's user data folder (tests use their own).
var save_dir := "user://"
## The scenario package loaded ("world-map-2026-v3"), for the save slots.
var scenario_name := ""
## The pick screen while it is open.
var pick: Control = null
## The bar along the top while the player leads a country, and the other
## panels of that screen.
var top_bar: PanelContainer = null
var army_list: PanelContainer = null
var reports: PanelContainer = null
var command_bar: PanelContainer = null
var event_card: Control = null
var economy_window: PanelContainer = null
var peace_window: Control = null
## The card about a foreign country clicked while leading.
var country_card: Control = null
## The other country of the open peace window, and whether it offered.
var peace_with := 0
var peace_incoming := true
## Whether the country on the card was at war with the player when it was
## made, to rebuild it when that changes.
var card_at_war := false
## Big reports waiting for their card, and the one shown.
var cards: Array = []
var card_report: Dictionary = {}
## Whether a card paused the game (so closing the last one resumes it).
var paused_by_card := false
## The screen when the led country capitulates.
var defeat_screen: Control = null
## The pause menu while leading a country, and whether it paused the game.
var menu: Control = null
var paused_by_menu := false
## `MwWorld.state_hash` at the last save or load (or when the player took
## the country): leaving asks first only when the game changed since.
var saved_hash := 0
## What New game and Quit do (tests replace them).
var restart := func() -> void: get_tree().reload_current_scene()
var quit_game := func() -> void: get_tree().quit()
## The led country's enemies at the last refresh, to notice a war begin.
var known_enemies := PackedInt32Array()


func _ready() -> void:
	# Closing the window asks first when the game changed since the last
	# save (see _notification).
	get_tree().set_auto_accept_quit(false)
	var args := _parse_args()
	var name: String = args.get("scenario", "world-map-2026-v3")
	scenario_name = name
	var path := ProjectSettings.globalize_path("res://").path_join(
		"../../assets/maps/compiled/%s.mwsc.gz" % name)
	var started := Time.get_ticks_msec()
	var error := scenario.load_package(path)
	if error != "":
		push_error(error)
		get_tree().quit(1)
		return
	print("Loaded %s in %d ms: %d countries, %d cities, %dx%d cells" % [
		scenario.scenario_name(), Time.get_ticks_msec() - started,
		scenario.country_count(), scenario.city_count(),
		scenario.grid_width(), scenario.grid_height()])

	owners = scenario.owner_image()
	started = Time.get_ticks_msec()
	var regions_error := scenario.load_regions(ProjectSettings.globalize_path("res://").path_join(
		"../../assets/geodata/admin1/regions.json.gz"))
	if regions_error == "":
		regions = scenario.region_image()
		print("Built %d regions in %d ms" % [scenario.region_count(), Time.get_ticks_msec() - started])
	else:
		push_warning("Regions not loaded: " + regions_error)
	_build_map()
	_build_ui()
	_start_sim(args)

	var view: PackedStringArray = String(args.get("view", "15,30,1.2")).split(",")
	camera.position = _world_from_lng_lat(float(view[0]), float(view[1]))
	camera.zoom = Vector2.ONE * float(view[2]) * get_viewport_rect().size.x / map_size.x
	if args.has("lead"):
		var id := scenario.country_id(args["lead"])
		if id == 0:
			push_error("--lead: no country named %s" % args["lead"])
		else:
			_lead(id, not args.has("view"))
	elif not args.has("war"):
		_open_pick()
		if args.has("pick"):
			var id := scenario.country_id(args["pick"])
			var capital := scenario.country_capital(id)
			if id == 0 or is_nan(capital.x):
				push_error("--pick: no country with a capital named %s" % args["pick"])
			else:
				_pick_country(id, _world_from_lng_lat(capital.x, capital.y))

	if args.has("probe"):
		for point in String(args["probe"]).split(";"):
			var lng_lat := point.split(",")
			var world := _world_from_lng_lat(float(lng_lat[0]), float(lng_lat[1]))
			var id := _country_at(world)
			print("probe %s -> %d %s | %s" % [point, id, scenario.country_name(id),
				scenario.region_name(_region_at(world))])
		get_tree().quit()
		return
	if args.has("hover"):
		var point: PackedStringArray = String(args["hover"]).split(",")
		_hover_world(_world_from_lng_lat(float(point[0]), float(point[1])))
	_refresh_sim()
	if args.has("select"):
		for id in String(args["select"]).split(","):
			var group: int = markers.group_of(int(id))
			if group != 0:
				_select_group(group)
			else:
				markers.selected[int(id)] = true
		_refresh_sim()
	_upload_control()
	if args.has("screenshot"):
		set_process_unhandled_input(false) # keep the picture repeatable
		set_process(false)
		_save_screenshot(args["screenshot"])


func _build_map() -> void:
	var width := float(owners.get_width())
	# Web Mercator from -MAX_LAT to +MAX_LAT, one unit per cell at the equator.
	map_size = Vector2(width, width * _mercator_y(MAX_LAT) / PI)
	var material := ShaderMaterial.new()
	material.shader = preload("res://map.gdshader")
	owners_texture = ImageTexture.create_from_image(owners)
	palette = scenario.palette_image()
	material.set_shader_parameter("owners", owners_texture)
	material.set_shader_parameter("palette", ImageTexture.create_from_image(palette))
	material.set_shader_parameter("max_lat", MAX_LAT)
	if regions:
		material.set_shader_parameter("regions", ImageTexture.create_from_image(regions))
		material.set_shader_parameter("has_regions", true)
	map_rect.material = material
	map_rect.size = map_size
	map_rect.position = -map_size / 2
	map_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(map_rect)
	markers.palette = palette
	markers.to_world = _world_from_lng_lat
	add_child(markers)
	add_child(camera)


func _build_ui() -> void:
	add_child(ui_layer)
	select_box.add_theme_stylebox_override("panel", Style.box(Color(Style.GOLD, 0.12), Style.GOLD, 2))
	select_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	select_box.visible = false
	ui_layer.add_child(select_box)
	no_hud = _parse_args().has("no-hud")
	for label in [info, clock, feed, details, help]:
		label.add_theme_color_override("font_outline_color", Color.BLACK)
		label.add_theme_constant_override("outline_size", 6)
		ui_layer.add_child(label)
		label.visible = not no_hud
	info.position = Vector2(16, 12)
	info.add_theme_font_size_override("font_size", 22)
	info.text = scenario.scenario_name()
	# License requirement: the data credit stays visible on every screen,
	# even with --no-hud.
	credit.text = scenario.attribution()
	credit.add_theme_font_override("font", Style.BODY)
	credit.add_theme_font_size_override("font_size", 12)
	credit.add_theme_color_override("font_color", Style.CREDIT)
	credit.add_theme_stylebox_override("normal", Style.box(Color(Style.PANEL, 0.8), Color.TRANSPARENT, 4, 10, 6))
	credit.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	credit.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	credit.grow_vertical = Control.GROW_DIRECTION_BEGIN
	credit.offset_right = -24
	credit.offset_bottom = -20
	ui_layer.add_child(credit)
	var screen := get_viewport_rect().size
	clock.add_theme_font_size_override("font_size", 22)
	clock.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	clock.position = Vector2(screen.x - 416, 12)
	clock.size = Vector2(400, 30)
	feed.add_theme_font_size_override("font_size", 15)
	feed.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	feed.position = Vector2(screen.x - 516, 48)
	feed.size = Vector2(500, 140)
	details.add_theme_font_size_override("font_size", 16)
	details.position = Vector2(16, screen.y - 58)
	help.add_theme_font_size_override("font_size", 14)
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	help.position = Vector2(screen.x - 816, screen.y - 92)
	help.size = Vector2(800, 40)
	_show_help()


## The pick screen: the world, paused, every label but the credits hidden.
func _open_pick() -> void:
	pick = PickScreen.new()
	pick.scenario = scenario
	pick.palette = palette
	pick.to_screen = func(world: Vector2) -> Vector2: return get_canvas_transform() * world
	pick.setup(scenario.start_date())
	pick.lead_pressed.connect(func(id: int) -> void: _lead(id, true))
	ui_layer.add_child(pick)
	ui_layer.move_child(credit, -1)
	for label in [info, clock, feed, details, help]:
		label.visible = false
	pick.visible = not no_hud


## Show a country's card on the pick screen (0 hides it).
func _pick_country(id: int, world: Vector2) -> void:
	(map_rect.material as ShaderMaterial).set_shader_parameter("selected_id", id)
	pick.show_country(id, world, sim.country_info(id) if id > 0 else {})


## The player takes `id`: the AI runs everyone else, the top bar replaces the
## pick screen, and (with `to_capital`) the camera moves to the capital.
func _lead(id: int, to_capital: bool) -> void:
	if not sim.lead(id):
		push_error("cannot lead country %d" % id)
		return
	player = id
	if pick != null:
		pick.queue_free()
		pick = null
	(map_rect.material as ShaderMaterial).set_shader_parameter("selected_id", -1)
	top_bar = TopBar.new()
	top_bar.scenario = scenario
	top_bar.palette = palette
	top_bar.setup()
	top_bar.pause_pressed.connect(func() -> void:
		sim.toggle_pause()
		_refresh_sim())
	top_bar.speed_pressed.connect(func(speed: int) -> void:
		sim.set_speed(speed)
		_refresh_sim())
	top_bar.economy_pressed.connect(func() -> void: _show_economy(not economy_window.visible))
	top_bar.visible = not no_hud
	ui_layer.add_child(top_bar)
	army_list = ArmyGroups.new()
	army_list.scenario = scenario
	army_list.setup()
	army_list.group_pressed.connect(_focus_group)
	army_list.unassigned_pressed.connect(_select_loose)
	reports = Reports.new()
	reports.setup()
	command_bar = CommandBar.new()
	command_bar.setup()
	command_bar.front_pressed.connect(func() -> void: _start_drawing("front"))
	command_bar.arrow_pressed.connect(func() -> void: _start_drawing("arrow"))
	command_bar.hold_pressed.connect(_hold)
	var key := MapKey.new()
	key.setup()
	for panel in [army_list, reports, command_bar, key]:
		panel.visible = not no_hud
		ui_layer.add_child(panel)
	economy_window = EconomyWindow.new()
	economy_window.scenario = scenario
	economy_window.palette = palette
	economy_window.setup()
	economy_window.visible = false
	economy_window.budget_changed.connect(func(recruiting: int, equipment: int) -> void:
		sim.set_budget(player, recruiting, equipment)
		_refresh_sim())
	economy_window.mobilization_changed.connect(func(level: int) -> void:
		sim.set_mobilization(player, level)
		_refresh_sim())
	economy_window.close_pressed.connect(func() -> void: _show_economy(false))
	ui_layer.add_child(economy_window)
	country_card = CountryCard.new()
	country_card.scenario = scenario
	country_card.palette = palette
	country_card.to_screen = func(world: Vector2) -> Vector2: return get_canvas_transform() * world
	country_card.setup()
	country_card.visible = not no_hud
	ui_layer.add_child(country_card)
	peace_window = PeaceWindow.new()
	peace_window.scenario = scenario
	peace_window.palette = palette
	peace_window.setup()
	peace_window.visible = false
	peace_window.answered.connect(_answer_peace)
	ui_layer.add_child(peace_window)
	event_card = EventCard.new()
	event_card.setup()
	event_card.visible = false
	event_card.closed.connect(_close_card)
	ui_layer.add_child(event_card)
	defeat_screen = DefeatScreen.new()
	defeat_screen.scenario = scenario
	defeat_screen.palette = palette
	defeat_screen.setup()
	defeat_screen.visible = false
	defeat_screen.watch_pressed.connect(_close_card)
	defeat_screen.load_pressed.connect(func() -> void:
		_close_defeat()
		# The menu now holds the game paused, and lets it run again if the
		# defeat paused it.
		_open_menu()
		paused_by_menu = paused_by_card or paused_by_menu
		paused_by_card = false
		menu.show_saves(_menu_state()))
	defeat_screen.new_game_pressed.connect(func() -> void: _do_leave("new"))
	ui_layer.add_child(defeat_screen)
	menu = PauseMenu.new()
	menu.setup()
	menu.visible = false
	menu.continued.connect(_close_menu)
	menu.new_game_pressed.connect(func() -> void: _leave("new"))
	menu.quit_pressed.connect(func() -> void: _leave("quit"))
	menu.leave_confirmed.connect(_do_leave)
	menu.save_pressed.connect(func(name: String) -> void:
		_after_save(_slots().create(sim, name), "Game saved: %s" % name))
	menu.overwrite_pressed.connect(func(path: String, name: String) -> void:
		_after_save(_slots().write(sim, path, name), "Game saved: %s" % name))
	menu.delete_pressed.connect(func(path: String) -> void:
		var error := _slots().delete(path)
		var state := _menu_state()
		state["message"] = error
		menu.show_saves(state))
	menu.load_pressed.connect(func(path: String) -> void:
		var error := _load_save(path)
		if error != "":
			var state := _menu_state()
			state["message"] = error
			menu.show_saves(state)
			return
		# The loaded game waits, paused, for the player to look at it.
		paused_by_menu = false
		menu.visible = false
		_refresh_sim())
	ui_layer.add_child(menu)
	ui_layer.move_child(credit, -1)
	for label in [clock, feed, details, help]:
		label.visible = false
	# The hover line moves to the bottom left corner, small.
	info.visible = not no_hud
	info.remove_theme_constant_override("outline_size")
	info.add_theme_font_override("font", Style.BODY)
	info.add_theme_font_size_override("font_size", 13)
	info.add_theme_color_override("font_color", Style.CREDIT)
	info.add_theme_stylebox_override("normal", Style.box(Color(Style.PANEL, 0.8), Color.TRANSPARENT, 4, 10, 6))
	info.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	info.grow_vertical = Control.GROW_DIRECTION_BEGIN
	info.offset_left = 16
	info.offset_bottom = -20
	info.text = ""
	hovered_id = -2
	markers.selected.clear()
	markers.selected_group = 0
	known_enemies = sim.enemies(id)
	var capital := scenario.country_capital(id)
	if to_capital and not is_nan(capital.x):
		var zoom := LEAD_ZOOM * get_viewport_rect().size.x / map_size.x
		var tween := create_tween().set_parallel().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tween.tween_property(camera, "position", _world_from_lng_lat(capital.x, capital.y), 0.7)
		tween.tween_property(camera, "zoom", Vector2(zoom, zoom), 0.7)
		tween.tween_callback(func() -> void:
			markers.pixel = 1.0 / camera.zoom.x
			markers.queue_redraw()).set_delay(0.7)
	# Nothing to lose yet: leaving right away asks nothing.
	saved_hash = sim.state_hash()
	_refresh_sim()


## Start the simulation, with the sandbox war from --war if given. Every
## country gets its real army and the scenario's wars begin, except in a
## --war sandbox without --forces.
func _start_sim(args: Dictionary) -> void:
	sim.start(scenario, int(args.get("seed", "1")))
	if args.has("forces") or not args.has("war"):
		var error := sim.deploy_forces(ProjectSettings.globalize_path("res://").path_join(
			"../../assets/data/forces/world-bank.json.gz"))
		if error != "":
			push_error("--forces: " + error)
		else:
			# License requirement (CC BY 4.0): the force data credit stays visible.
			credit.text += "  ·  Forces: World Bank, IISS (CC BY 4.0)"
		# The wars already going on when the scenario starts.
		for war in Scenarios.wars(scenario_name):
			var attacker := scenario.country_id(war[0])
			var defender := scenario.country_id(war[1])
			if attacker == 0 or defender == 0 or not sim.declare_war(attacker, defender):
				push_error("%s: cannot start the war of %s on %s" % [scenario_name, war[0], war[1]])
	if args.has("war"):
		var war: PackedStringArray = String(args["war"]).split(",")
		var sides: Array[int] = []
		for side in war.slice(0, 2):
			var id := scenario.country_id(side)
			if id == 0:
				push_error("--war: no country named %s" % side)
			sides.append(id)
		if sides.size() == 2 and not sides.has(0):
			var error := ""
			if args.has("forces"):
				if not sim.declare_war(sides[0], sides[1]):
					error = "could not declare war"
			else:
				error = sim.sandbox_war(sides[0], sides[1],
					int(war[2]) if war.size() > 2 else 24, int(war[3]) if war.size() > 3 else 12)
			if error != "":
				push_error("--war: " + error)
			elif args.has("ai"):
				for side in sides:
					sim.set_ai(side, true)
		elif sides.size() < 2:
			push_error("--war needs two countries: --war=<attacker>,<defender>")
	if args.has("speed"):
		sim.set_speed(int(args["speed"]))
	if args.has("run"):
		sim.run(int(args["run"]))
	if args.has("play"):
		sim.toggle_pause()


## Show the simulation's current state: markers, routes, control, events, clock.
func _refresh_sim() -> void:
	markers.pixel = 1.0 / camera.zoom.x
	markers.update(sim.divisions())
	# Divisions that are gone (destroyed or surrendered) leave the selection.
	for id in markers.selected.keys():
		if not markers.positions.has(id):
			markers.selected.erase(id)
	markers.routes.clear()
	for id in markers.selected:
		if not markers.positions.has(id):
			continue
		var route := sim.route(id)
		if route.size() > 1:
			var points := PackedVector2Array()
			for point in route:
				points.append(_world_from_lng_lat(point.x, point.y))
			markers.routes[id] = points
	markers.groups.clear()
	var formed := {}
	for group in sim.groups():
		# Each country's groups are numbered in the order they were formed,
		# so a group keeps its name ("2nd Army Group") when others empty.
		var owner := int(group["country"])
		formed[owner] = int(formed.get(owner, 0)) + 1
		group["number"] = formed[owner]
		# A group whose divisions all left (regrouped, lost) is not shown:
		# no row in the list and no front on the map.
		if PackedInt64Array(group["divisions"]).is_empty():
			continue
		for key in ["front", "arrow"]:
			var points := PackedVector2Array()
			for point in PackedVector2Array(group[key]):
				points.append(_world_from_lng_lat(point.x, point.y))
			group[key] = points
		# The front steps cell by cell around pockets; draw it smoothed.
		group["front"] = Lines.smooth(group["front"])
		markers.groups.append(group)
	if markers.groups.all(func(g: Dictionary) -> bool: return int(g["id"]) != markers.selected_group):
		markers.selected_group = 0
	var changes := sim.control_changes()
	for i in range(0, changes.size(), 3):
		var country := changes[i + 2]
		owners.set_pixel(changes[i], changes[i + 1], Color8(country & 255, country >> 8, 255, 255))
	if changes.size() > 0:
		control_dirty = true
		hovered_id = -2 # the label may name a new holder
	var news := sim.take_reports()
	var state := "Paused" if sim.is_paused() else "Speed %d" % sim.speed()
	clock.text = "%s   %s" % [sim.time_text(), state]
	if top_bar == null:
		for report in news:
			_add_feed(report["text"])
		_show_feed()
		_show_details()
		return
	var divisions := 0
	for i in range(0, markers.data.size(), MwWorld.DIVISION_STRIDE):
		if int(markers.data[i + 1]) == player:
			divisions += 1
	reports.add(news, _today())
	_check_new_wars()
	for report in news:
		if report["big"] != "":
			cards.append(report)
	_show_next_card()
	var shown := int(country_card.country)
	if country_card.card.visible and sim.enemies(player).has(shown) != card_at_war:
		_show_country_card(shown, country_card.spot)
	var economy: Dictionary = sim.economy(player)
	top_bar.show_state(player, economy, sim.enemies(player), divisions,
		sim.time_text(), sim.is_paused(), sim.speed())
	if economy_window.visible:
		economy_window.show_economy(player, economy, sim.is_ai(player))
	var grouped := {}
	for group in _own_groups():
		for id in PackedInt64Array(group["divisions"]):
			grouped[id] = true
	army_list.show_groups(_own_groups(), divisions, markers.selected_group, divisions - grouped.size())
	_show_command_bar()


## Open or close the budget and mobilization window.
func _show_economy(open: bool) -> void:
	economy_window.visible = open and not no_hud
	if economy_window.visible:
		economy_window.show_economy(player, sim.economy(player), sim.is_ai(player))


## The game date, "2026-10-25".
func _today() -> String:
	return sim.time_text().split(" ")[0]


## A message from the game itself (not the simulation): into the reports
## while the player leads a country, else into the feed.
func _note(line: String) -> void:
	if reports != null:
		var time := sim.time_text().split(" ")
		reports.add([{"text": line, "date": time[0], "hour": int(time[1].left(2)), "mine": true,
			"tone": ""}], time[0])
	else:
		_add_feed(line)
		_show_feed()


## A war of the led country that just began on a border none of its army
## groups holds: say so in the reports, once.
func _check_new_wars() -> void:
	var enemies := sim.enemies(player)
	for enemy in enemies:
		if not known_enemies.has(enemy) and _unguarded(enemy):
			_note("No army group holds your border with %s: select one and draw its front along it (F)"
				% scenario.country_name(enemy))
	known_enemies = enemies


## Whether `enemy` borders the led country by land and none of its army
## groups faces it.
func _unguarded(enemy: int) -> bool:
	var neighbors := PackedInt32Array(sim.country_info(player).get("neighbors", PackedInt32Array()))
	return neighbors.has(enemy) and _own_groups().all(
		func(group: Dictionary) -> bool: return int(group["enemy"]) != enemy)


## The player's army groups, from the last refresh.
func _own_groups() -> Array:
	return markers.groups.filter(func(g: Dictionary) -> bool: return int(g["country"]) == player)


## "1st Army Group" for the player's first group, and so on.
func _group_name(group: int) -> String:
	for g in _own_groups():
		if int(g["id"]) == group:
			return "%s Army Group" % Style.ordinal(int(g["number"]))
	return "Army group %d" % group


func _show_command_bar() -> void:
	if command_bar == null:
		return
	command_bar.visible = not no_hud and not peace_window.visible \
		and (drawing != "" or not markers.selected.is_empty())
	if not command_bar.visible:
		return
	var name := "%d divisions" % markers.selected.size()
	var can_hold := false
	if markers.selected_group != 0:
		name = _group_name(markers.selected_group)
		for group in markers.groups:
			if int(group["id"]) == markers.selected_group:
				can_hold = PackedVector2Array(group["arrow"]).size() > 0
	var detail := ""
	if markers.selected_group == 0 and markers.selected.size() == 1:
		var id := int(markers.selected.keys()[0])
		name = "Division %d" % id
		detail = _division_state(id)
	command_bar.show_selection(name, can_hold, drawing, detail)


## "98% strength  ·  100% morale  ·  holding" for a division, or "" when it
## is gone.
func _division_state(id: int) -> String:
	var data := markers.data
	for i in range(0, data.size(), MwWorld.DIVISION_STRIDE):
		if int(data[i]) == id:
			return _division_state_at(i)
	return ""


## The same for the division at index `i` of markers.data.
func _division_state_at(i: int) -> String:
	var data := markers.data
	var flags := int(data[i + 6])
	var state := "fighting" if flags & MwWorld.IN_BATTLE else (
		"marching" if flags & MwWorld.MOVING else "holding")
	if not flags & MwWorld.SUPPLIED:
		state += ", cut off"
	return "%d%% strength  ·  %d%% morale  ·  %s" % [
		roundi(data[i + 4] * 100.0), roundi(data[i + 5] * 100.0), state]


## Select one of the player's groups from the list and look at it.
func _focus_group(group: int) -> void:
	_select_group(group)
	var center := Vector2.ZERO
	var count := 0
	for id in markers.selected:
		if markers.positions.has(id):
			center += markers.positions[id]
			count += 1
	if count > 0:
		create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT) \
			.tween_property(camera, "position", center / count, 0.5)
	_refresh_sim()


## Select the player's divisions that are in no army group.
func _select_loose() -> void:
	var grouped := {}
	for group in _own_groups():
		for id in PackedInt64Array(group["divisions"]):
			grouped[id] = true
	markers.selected.clear()
	markers.selected_group = 0
	for id in markers.countries:
		if markers.countries[id] == player and not grouped.has(id):
			markers.selected[id] = true
	_refresh_sim()


## Select every division of the country you lead (Ctrl+A).
func _select_all_own() -> void:
	markers.selected.clear()
	markers.selected_group = 0
	for id in markers.countries:
		if markers.countries[id] == player:
			markers.selected[id] = true
	_refresh_sim()


## Add the divisions inside a screen rectangle to the selection (only your
## own while you lead a country).
func _select_in_box(box: Rect2) -> void:
	var added := false
	for id in markers.positions:
		if player != 0 and markers.countries[id] != player:
			continue
		if box.has_point(get_canvas_transform() * markers.positions[id]) and not markers.selected.has(id):
			markers.selected[id] = true
			added = true
	if added:
		# Loose divisions now, not one group (an empty box changes nothing).
		markers.selected_group = 0
		_refresh_sim()


## Take the selected group's arrow away: it holds its front.
func _hold() -> void:
	if markers.selected_group != 0:
		sim.draw_arrow(markers.selected_group, PackedVector2Array())
		_refresh_sim()


## Open the card for the next big report, pausing the game. Cards wait
## while the pause menu is open.
func _show_next_card() -> void:
	if event_card.visible or peace_window.visible or menu.visible or defeat_screen.visible:
		return
	# A peace offer that is no longer open (the war ended in the same hour:
	# the country capitulated or made peace) gets no window.
	card_report = {}
	while not cards.is_empty() and card_report.is_empty():
		var next: Dictionary = cards.pop_front()
		if next["big"] != "peace_offer" or _offered_peace(int(next["other"])):
			card_report = next
	if card_report.is_empty():
		return
	var other := scenario.country_name(int(card_report["other"]))
	var kind := String(card_report["big"])
	_pause_for_card()
	match kind:
		"war":
			if _unguarded(int(card_report["other"])):
				event_card.show_event("WAR", "%s declared war on you" % other,
					"Its divisions will cross the border, and none of your army groups holds it yet: "
					+ "select one and draw its front along it (F), then arrows where you want to "
					+ "strike back (R).")
			else:
				event_card.show_event("WAR", "%s declared war on you" % other,
					"Its divisions will cross the border. Give your army groups fronts along it, "
					+ "and arrows where you want to strike back.")
		"peace_offer":
			_open_peace(int(card_report["other"]), true)
		"peace":
			event_card.show_event("PEACE", "Peace with %s" % other,
				"The war is over. The reports list the regions that changed hands.")
		"capitulated":
			if int(card_report["other"]) == player:
				defeat_screen.show_defeat(player, sim.war_record(player))
			else:
				event_card.show_event("VICTORY", "%s capitulated" % other,
					_victory_text(int(card_report["other"])))


## Whether `other` has an open peace offer to the led country.
func _offered_peace(other: int) -> bool:
	return sim.peace_offers().any(func(offer: Dictionary) -> bool:
		return int(offer["from"]) == other and int(offer["to"]) == player)


## What a victory over `enemy` gave the led country: the regions its
## capitulation handed over to it, by name.
func _victory_text(enemy: int) -> String:
	var gained := PackedStringArray()
	for region in sim.war_record(enemy).get("ceded", []):
		if int(region["to"]) == player:
			gained.append(scenario.region_name(int(region["region"])))
	if gained.is_empty():
		return ("It gave up and the war is over, but you held most of none of its regions, "
			+ "so none of them are yours.")
	var listed := Style.list_and(gained)
	if gained.size() > 6:
		listed = ", ".join(gained.slice(0, 6)) + " and %d more" % (gained.size() - 6)
	return "It gave up and the war is over. You gain %s." % listed


func _close_card() -> void:
	card_report = {}
	event_card.visible = false
	defeat_screen.visible = false
	_after_modal()


## Close the defeat screen without letting the game run again.
func _close_defeat() -> void:
	card_report = {}
	defeat_screen.visible = false


## Pause while a card or the peace window is open, remembering to resume.
func _pause_for_card() -> void:
	if not sim.is_paused():
		sim.toggle_pause()
		paused_by_card = true


## After a card or the peace window closed: the next card, or let the game
## run again if a card paused it.
func _after_modal() -> void:
	_show_next_card()
	if not event_card.visible and not peace_window.visible and not defeat_screen.visible \
			and paused_by_card:
		paused_by_card = false
		if sim.is_paused():
			sim.toggle_pause()
	_refresh_sim()


## Open the peace window with `other`: an offer it made (`incoming`) or one
## the player is about to make. The regions that would change hands are
## striped on the map and the camera turns to them.
func _open_peace(other: int, incoming: bool) -> void:
	peace_with = other
	peace_incoming = incoming
	_pause_for_card()
	country_card.show_country(0, Vector2.ZERO, {}, "", [], "")
	var terms := sim.peace_terms(player, other)
	# One pixel per region number up to the highest one marked; the shader
	# leaves regions past the edge alone.
	var width := 1
	for term in terms:
		width = maxi(width, int(term["region"]) + 1)
	var marks := Image.create(width, 1, false, Image.FORMAT_RGBA8)
	var anchors := PackedVector2Array()
	for term in terms:
		var gain := int(term["to"]) == player
		marks.set_pixel(int(term["region"]), 0, Color(1, 0, 0) if gain else Color(0, 1, 0))
		var anchor := scenario.region_anchor(int(term["region"]))
		if not is_nan(anchor.x):
			anchors.append(_world_from_lng_lat(anchor.x, anchor.y))
	var material := map_rect.material as ShaderMaterial
	material.set_shader_parameter("marks", ImageTexture.create_from_image(marks))
	material.set_shader_parameter("has_marks", true)
	if anchors.size() > 0:
		var center := Vector2.ZERO
		for anchor in anchors:
			center += anchor
		center /= anchors.size()
		# Put them in the middle of the map left of the window.
		var screen_w := get_viewport_rect().size.x
		var target_x := (screen_w - PeaceWindow.WIDTH - 16) / 2.0
		var at := (center + Vector2((screen_w / 2.0 - target_x) / camera.zoom.x, 0)).clamp(
			-map_size / 2, map_size / 2)
		create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT) \
			.tween_property(camera, "position", at, 0.5)
	for panel in [army_list, reports, command_bar]:
		panel.visible = false
	peace_window.show_terms(incoming, player, other, terms, {"player": _side(player), "other": _side(other)})


## One side of the peace window's table.
func _side(country: int) -> Dictionary:
	var economy: Dictionary = sim.economy(country)
	var army: Dictionary = sim.army(country)
	return {"divisions": army["divisions"], "personnel": army["personnel"],
		"land": float(economy["home_k"]) / maxf(1.0, float(economy["home_total_k"])),
		"income_k": economy["income_k"], "support": economy["support"]}


func _answer_peace(accept: bool) -> void:
	if peace_incoming:
		sim.answer_peace(peace_with, player, accept)
	elif accept and not sim.offer_peace_to(player, peace_with):
		# Sent offers show in the reports; say why one was not sent.
		_note("No offer went to %s: you are not at war, or your last offer is still open"
			% scenario.country_name(peace_with))
	peace_window.visible = false
	(map_rect.material as ShaderMaterial).set_shader_parameter("has_marks", false)
	for panel in [army_list, reports]:
		panel.visible = not no_hud
	card_report = {}
	_after_modal()


## The card for a foreign country clicked while leading: declare war on it,
## or offer it peace when at war.
func _show_country_card(country: int, world: Vector2) -> void:
	if country <= 0 or country == player:
		country_card.show_country(0, Vector2.ZERO, {}, "", [], "")
		return
	var at_war := sim.enemies(player).has(country)
	card_at_war = at_war
	# The buttons look again when pressed: a war may have started or ended
	# since the card opened.
	var action: Callable
	if at_war:
		action = func() -> void:
			if sim.enemies(player).has(country):
				_open_peace(country, false)
			else:
				_show_country_card(country, world)
	else:
		action = func() -> void:
			if not sim.enemies(player).has(country):
				sim.declare_war(player, country)
			country_card.show_country(0, Vector2.ZERO, {}, "", [], "")
			_refresh_sim()
	country_card.show_country(country, world, sim.country_info(country),
		"At war with you" if at_war else "At peace with you",
		[["Offer peace" if at_war else "Declare war", true, action]], "Esc closes")


## The saves of this scenario and the led country (or the viewer): a save
## made leading one country must not load into a game leading another (it
## would hand yours to the AI and leave the saved one with no one running
## it). The id tells apart countries of one name.
func _slots() -> SaveSlots:
	var slots := SaveSlots.new()
	slots.dir = save_dir
	slots.scenario_name = scenario_name
	if player != 0:
		slots.who = "%d-%s" % [player, scenario.country_name(player)]
	return slots


func _quicksave_path() -> String:
	return _slots().quick_path()


func _quicksave() -> void:
	var error := _slots().write(sim, _quicksave_path(), "Quick save")
	if error == "":
		saved_hash = sim.state_hash()
	_note(error if error != "" else "Game saved")


## Load the quick save. Returns whether it loaded.
func _quickload() -> bool:
	var path := _quicksave_path()
	if not FileAccess.file_exists(path):
		var whose := (" for %s" % scenario.country_name(player)) if player != 0 else ""
		_note("No quick save%s yet: F5 makes one" % whose)
		return false
	var error := _load_save(path)
	if error != "":
		_note(error)
	return error == ""


## Load a save of this scenario and country. Returns an empty string or
## the error (the game goes on as it was then).
func _load_save(path: String) -> String:
	var error := sim.load_game(path)
	if error != "":
		return error
	saved_hash = sim.state_hash()
	markers.selected.clear()
	markers.selected_group = 0
	if drawing != "":
		drawing = ""
		stroke_points.clear()
		markers.stroke.clear()
		_show_help()
	if player != 0:
		# What was waiting or open belonged to the game before the load (the
		# menu can open over a card or the peace window when the window is
		# closed); the loaded game waits, paused, until the player goes on.
		cards.clear()
		card_report = {}
		event_card.visible = false
		defeat_screen.visible = false
		if peace_window.visible:
			peace_window.visible = false
			(map_rect.material as ShaderMaterial).set_shader_parameter("has_marks", false)
			for panel in [army_list, reports]:
				panel.visible = not no_hud
		paused_by_card = false
		country_card.show_country(0, Vector2.ZERO, {}, "", [], "")
		reports.clear()
		# Peace offered to the player in the saved game waits for an answer.
		for offer in sim.peace_offers():
			if int(offer["to"]) == player:
				cards.append({"big": "peace_offer", "other": int(offer["from"])})
		# The saved game's wars are not news.
		known_enemies = sim.enemies(player)
	else:
		feed_lines.clear() # the viewer's feed starts over too
	_note("Game loaded")
	return ""


## The pause menu, pausing the game until it closes.
func _open_menu() -> void:
	if not sim.is_paused():
		sim.toggle_pause()
		paused_by_menu = true
	menu.show_menu(_menu_state())
	_refresh_sim()


func _close_menu() -> void:
	menu.visible = false
	if paused_by_menu:
		paused_by_menu = false
		if sim.is_paused():
			sim.toggle_pause()
	_refresh_sim()


## What the pause menu shows (see PauseMenu.state).
func _menu_state() -> Dictionary:
	var slots := _slots()
	var enemies := PackedStringArray()
	for enemy in sim.enemies(player):
		enemies.append(scenario.country_name(enemy))
	var time := sim.time_text()
	return {"date": time, "name": scenario.country_name(player),
		"color": palette.get_pixel(player, 0), "enemies": enemies,
		"scenario": scenario.scenario_name(), "quick": slots.quick(), "saves": slots.list(),
		"suggested": "%s, %s" % [Style.long_date(_today()), time.get_slice(" ", 1)]}


## After a save from the menu: the list again with the new save, or the
## error.
func _after_save(error: String, line: String) -> void:
	if error == "":
		saved_hash = sim.state_hash()
		menu.typed_name = "" # the next save gets a new suggested name
		_note(line)
	var state := _menu_state()
	state["message"] = error
	menu.show_saves(state)


## Whether the game changed since the last save or load.
func _unsaved() -> bool:
	return sim.state_hash() != saved_hash


## New game ("new") or Quit ("quit"): ask first if the game changed since
## the last save.
func _leave(action: String) -> void:
	if _unsaved():
		menu.show_leave(action)
	else:
		_do_leave(action)


func _do_leave(action: String) -> void:
	if action == "new":
		restart_args = {"scenario": scenario_name}
		restart.call()
	else:
		quit_game.call()


func _notification(what: int) -> void:
	if what != NOTIFICATION_WM_CLOSE_REQUEST:
		return
	if menu != null and _unsaved():
		if not menu.visible:
			_open_menu()
		menu.show_leave("quit")
	else:
		quit_game.call()


func _add_feed(line: String) -> void:
	if not feed_lines.is_empty() and feed_lines[-1][0] == line:
		feed_lines[-1][1] += 1
	else:
		feed_lines.append([line, 1])
	if feed_lines.size() > FEED_LINES:
		feed_lines = feed_lines.slice(feed_lines.size() - FEED_LINES)


func _show_feed() -> void:
	var lines: PackedStringArray = []
	for entry in feed_lines:
		lines.append(entry[0] if entry[1] == 1 else "%s (×%d)" % entry)
	feed.text = "\n".join(lines)


func _upload_control() -> void:
	if control_dirty:
		owners_texture.update(owners)
		control_dirty = false
	since_upload = 0.0


## One line about the selection, above the credit.
func _show_details() -> void:
	var stride := MwWorld.DIVISION_STRIDE
	var data := markers.data
	var lines: PackedStringArray = []
	var count := 0
	for i in range(0, data.size(), stride):
		if not markers.selected.has(int(data[i])):
			continue
		count += 1
		if count == 1:
			lines.append("%s division %d  ·  %s" % [scenario.country_name(int(data[i + 1])), int(data[i]),
				_division_state_at(i)])
	if count > 1:
		lines = PackedStringArray(["%d divisions selected" % count])
	var country := _acting_country()
	if country != 0:
		var e: Dictionary = sim.economy(country)
		var budget := "%d%% recruiting, %d%% equipment" % [e["recruiting"], e["equipment"]]
		for i in BUDGETS.size():
			if BUDGETS[i][0] == int(e["recruiting"]) and BUDGETS[i][1] == int(e["equipment"]):
				budget = BUDGET_NAMES[i]
		lines.append("%s%s  ·  $%.2f bn a day  ·  %s  ·  %s  ·  %s to draft  ·  %d%% support" % [
			scenario.country_name(country), " (AI)" if sim.is_ai(country) else "",
			float(e["income_k"]) / 1e6, budget,
			MOBILIZATION_NAMES[int(e["mobilization"])], _thousands(int(e["manpower"])),
			roundi(int(e["support"]) / 10.0)])
	details.text = "\n".join(lines)
	details.position.y = get_viewport_rect().size.y - 36 - 22 * lines.size()


## The country the stand-in controls act for: the one the player leads, or
## in the viewer the selected division's.
func _acting_country() -> int:
	return player if player != 0 else _selected_country()


## The country of the first selected division, or 0.
func _selected_country() -> int:
	var stride := MwWorld.DIVISION_STRIDE
	for i in range(0, markers.data.size(), stride):
		if markers.selected.has(int(markers.data[i])):
			return int(markers.data[i + 1])
	return 0


func _thousands(value: int) -> String:
	var text := str(value)
	var out := ""
	while text.length() > 3:
		out = "," + text.right(3) + out
		text = text.left(text.length() - 3)
	return text + out


func _show_help() -> void:
	_show_command_bar()
	match drawing:
		"front":
			help.text = "Drawing a front: drag along the border with the left mouse button  ·  Esc cancels"
		"arrow":
			help.text = "Drawing an arrow: drag from the front into enemy land  ·  Esc cancels"
		_:
			help.text = ("Space pause  ·  1-5 speed  ·  click select  ·  Shift+drag box  ·  right-click move  ·  "
				+ "G group  ·  F front  ·  R arrow  ·  X drop arrow\n"
				+ "B budget  ·  M mobilize  ·  Shift+W war  ·  P peace  ·  Y/N answer  ·  I AI on/off  ·  F5/F9 save/load  ·  Esc clear")


## Click: select a division, or its whole army group. Shift-click adds or
## removes one division and leaves group selection.
func _select_at(screen_point: Vector2, add: bool) -> void:
	var world := get_canvas_transform().affine_inverse() * screen_point
	if pick != null:
		var country := _country_at(world)
		_pick_country(country if country > 0 else 0, world)
		return
	var id: int = markers.pick(world, 12.0, player)
	if country_card != null:
		_show_country_card(_country_at(world) if id < 0 and not add else 0, world)
	if add:
		markers.selected_group = 0
		if id >= 0:
			if markers.selected.has(id):
				markers.selected.erase(id)
			else:
				markers.selected[id] = true
	else:
		_select_group(markers.group_of(id) if id >= 0 else 0)
		if id >= 0 and markers.selected_group == 0:
			markers.selected[id] = true
	_refresh_sim()


## Select every division of a group (0 clears the selection).
func _select_group(group: int) -> void:
	markers.selected.clear()
	markers.selected_group = group
	for entry in markers.groups:
		if int(entry["id"]) == group:
			for division in PackedInt64Array(entry["divisions"]):
				markers.selected[division] = true


## The selected army group, formed from the selection first if needed; 0 if
## nothing is selected.
func _group_for_drawing() -> int:
	if markers.selected_group != 0:
		return markers.selected_group
	if markers.selected.is_empty():
		return 0
	var group := int(sim.create_group(PackedInt64Array(markers.selected.keys())))
	_refresh_sim()
	if group != 0:
		_select_group(group)
	return group


func _start_drawing(kind: String) -> void:
	if _group_for_drawing() == 0:
		_note("Select divisions or an army group first")
		_refresh_sim()
		return
	drawing = kind
	_show_help()


func _finish_drawing() -> void:
	var group := markers.selected_group
	if stroke_points.size() > 0 and group != 0:
		if drawing == "front":
			sim.set_front(group, stroke_points)
		else:
			sim.draw_arrow(group, stroke_points)
	drawing = ""
	stroke_points.clear()
	markers.stroke.clear()
	_show_help()
	_refresh_sim()


func _order_at(screen_point: Vector2) -> void:
	if markers.selected.is_empty() or pick != null:
		return
	var world := get_canvas_transform().affine_inverse() * screen_point
	var lng_lat := _lng_lat_from_world(world)
	sim.move_divisions(PackedInt64Array(markers.selected.keys()), lng_lat.x, lng_lat.y)
	markers.selected_group = 0
	_refresh_sim()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		match button.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				_zoom_at(1.15, button.position)
			MOUSE_BUTTON_WHEEL_DOWN:
				_zoom_at(1.0 / 1.15, button.position)
			MOUSE_BUTTON_LEFT when pick == null and (boxing or (button.pressed and button.shift_pressed
					and drawing == "")):
				# Shift+drag draws a box; a Shift-click without dragging adds or
				# removes one division. A box ends with its own release, even
				# if F or R started a drawing meanwhile.
				if button.pressed:
					boxing = true
					box_cancelled = false
					box_from = button.position
					select_box.position = box_from
					select_box.size = Vector2.ZERO
				else:
					boxing = false
					select_box.visible = false
					if box_cancelled or drawing != "":
						pass # Esc dropped it, or a drawing started meanwhile keeps its group
					elif button.position.distance_to(box_from) < CLICK_SLOP:
						_select_at(button.position, true)
					else:
						_select_in_box(Rect2(box_from, Vector2.ZERO).expand(button.position))
			MOUSE_BUTTON_LEFT when drawing != "":
				if button.pressed:
					stroke_points = PackedVector2Array([_lng_lat_at(button.position)])
					markers.stroke = PackedVector2Array([_screen_to_world(button.position)])
					markers.stroke_is_arrow = drawing == "arrow"
				else:
					_finish_drawing()
			MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT when boxing:
				# No panning or orders while a box is drawn, but a pan whose
				# button is let go meanwhile still ends.
				if not button.pressed:
					dragging = false
			MOUSE_BUTTON_LEFT, MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT:
				dragging = button.pressed
				if button.pressed:
					press_at = button.position
				elif button.position.distance_to(press_at) < CLICK_SLOP:
					if button.button_index == MOUSE_BUTTON_LEFT:
						_select_at(button.position, button.shift_pressed)
					elif button.button_index == MOUSE_BUTTON_RIGHT:
						_order_at(button.position)
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if drawing != "" and stroke_points.size() > 0:
			var last: Vector2 = get_canvas_transform() * markers.stroke[markers.stroke.size() - 1]
			if motion.position.distance_to(last) >= 6.0:
				stroke_points.append(_lng_lat_at(motion.position))
				markers.stroke.append(_screen_to_world(motion.position))
				markers.queue_redraw()
		elif boxing:
			var box := Rect2(box_from, Vector2.ZERO).expand(motion.position)
			select_box.position = box.position
			select_box.size = box.size
			select_box.visible = not box_cancelled and box.size.length() >= CLICK_SLOP
		elif dragging:
			camera.position -= motion.relative / camera.zoom
			_clamp_camera()
		_update_hover(motion.position)
	elif event is InputEventKey and event.pressed:
		var key := (event as InputEventKey).keycode
		# A held key repeats only for zooming: it must not answer the next
		# window unseen or give the same order again and again.
		if (event as InputEventKey).echo and key not in [KEY_EQUAL, KEY_KP_ADD, KEY_MINUS, KEY_KP_SUBTRACT]:
			return
		if menu != null and menu.visible:
			# The menu keeps the game paused; only its own keys work.
			if key == KEY_ESCAPE:
				menu.back() # (PauseMenu._input takes Esc first in a running game)
			elif key == KEY_F5:
				_quicksave()
				if menu.view == "saves":
					menu.show_saves(_menu_state())
				else:
					# Saved now: "Leave this game?" no longer applies.
					menu.show_menu(_menu_state())
			elif key == KEY_F9 and _quickload():
				paused_by_menu = false
				menu.visible = false
				_refresh_sim()
			return
		if event_card != null and event_card.visible:
			# A card waits to be closed; the game stays paused.
			if key == KEY_ENTER or key == KEY_KP_ENTER or key == KEY_ESCAPE:
				_close_card()
			return
		if defeat_screen != null and defeat_screen.visible:
			# Esc watches the world go on, F5 and F9 still save and load;
			# nothing else reaches the game.
			if key == KEY_ESCAPE:
				_close_card()
			elif key == KEY_F5:
				_quicksave()
			elif key == KEY_F9 and _quickload():
				_refresh_sim()
			return
		if peace_window != null and peace_window.visible:
			if key == KEY_Y or key == KEY_ENTER or key == KEY_KP_ENTER:
				_answer_peace(true)
			elif key == KEY_N or key == KEY_ESCAPE:
				_answer_peace(false)
			return
		if key == KEY_EQUAL or key == KEY_KP_ADD:
			_zoom_at(1.25, get_viewport_rect().size / 2)
		elif key == KEY_MINUS or key == KEY_KP_SUBTRACT:
			_zoom_at(0.8, get_viewport_rect().size / 2)
		elif pick != null:
			# The pick screen only looks at the map; the game has not started.
			if key == KEY_ESCAPE:
				_pick_country(0, Vector2.ZERO)
		elif key == KEY_SPACE:
			sim.toggle_pause()
			_refresh_sim()
		elif key >= KEY_1 and key <= KEY_5:
			sim.set_speed(key - KEY_0)
			_refresh_sim()
		elif key == KEY_A and (event as InputEventKey).ctrl_pressed and player != 0 and drawing == "":
			_select_all_own()
		elif key == KEY_G and not markers.selected.is_empty():
			var group := int(sim.create_group(PackedInt64Array(markers.selected.keys())))
			_refresh_sim()
			if group != 0:
				_select_group(group)
				_refresh_sim()
		elif key == KEY_F:
			_start_drawing("front")
		elif key == KEY_R:
			_start_drawing("arrow")
		elif (key == KEY_B or key == KEY_M) and economy_window != null:
			_show_economy(not economy_window.visible)
		elif key == KEY_B and _acting_country() != 0:
			var country := _acting_country()
			var now: Dictionary = sim.economy(country)
			var next := 0
			for i in BUDGETS.size():
				if BUDGETS[i][0] == int(now["recruiting"]) and BUDGETS[i][1] == int(now["equipment"]):
					next = (i + 1) % BUDGETS.size()
			sim.set_budget(country, BUDGETS[next][0], BUDGETS[next][1])
			_refresh_sim()
		elif key == KEY_M and _acting_country() != 0:
			var country := _acting_country()
			sim.set_mobilization(country, (int(sim.economy(country)["mobilization"]) + 1) % 4)
			_refresh_sim()
		elif key == KEY_I and _acting_country() != 0:
			var country := _acting_country()
			var on := not sim.is_ai(country)
			sim.set_ai(country, on)
			_note(("%s is now run by the AI" if on else "%s takes orders from you again")
				% scenario.country_name(country))
			_refresh_sim()
		elif key == KEY_W and (event as InputEventKey).shift_pressed and _acting_country() != 0 \
				and hovered_id > 0:
			# Shift: W alone pans the map.
			sim.declare_war(_acting_country(), hovered_id)
			_refresh_sim()
		elif key == KEY_P and _acting_country() != 0:
			if sim.offer_peace(_acting_country()) == 0:
				_note("%s is at war with nobody" % scenario.country_name(_acting_country()))
			_refresh_sim()
		elif key == KEY_Y or key == KEY_N:
			var newest: Dictionary = {}
			for offer in sim.peace_offers():
				if player != 0 and int(offer["to"]) != player:
					continue
				if newest.is_empty() or int(offer["tick"]) >= int(newest["tick"]):
					newest = offer
			if newest.is_empty():
				_note("No open peace offers")
			else:
				sim.answer_peace(int(newest["from"]), int(newest["to"]), key == KEY_Y)
			_refresh_sim()
		elif key == KEY_F5:
			_quicksave()
			_refresh_sim()
		elif key == KEY_F9:
			_quickload()
			_refresh_sim()
		elif key == KEY_X and markers.selected_group != 0:
			_hold()
		elif key == KEY_ESCAPE and boxing and not box_cancelled:
			# The box stays open until its button is let go, so that release
			# is not taken for a click.
			box_cancelled = true
			select_box.visible = false
		elif key == KEY_ESCAPE and economy_window != null and economy_window.visible:
			_show_economy(false)
		elif key == KEY_ESCAPE and country_card != null and country_card.card.visible:
			_show_country_card(0, Vector2.ZERO)
		elif key == KEY_ESCAPE:
			if drawing != "":
				drawing = ""
				stroke_points.clear()
				markers.stroke.clear()
				_show_help()
			elif not markers.selected.is_empty() or markers.selected_group != 0 or menu == null:
				markers.selected.clear()
				markers.selected_group = 0
			else:
				_open_menu()
				return
			_refresh_sim()


func _process(delta: float) -> void:
	# The arrow keys and WASD pan, but not while a card, the peace window or
	# the pause menu is open (they move the caret in the save name box), and
	# WASD not as part of Ctrl+A or Shift+W.
	var modal: bool = (event_card != null and event_card.visible) \
		or (peace_window != null and peace_window.visible) or (menu != null and menu.visible) \
		or (defeat_screen != null and defeat_screen.visible)
	var direction := Vector2.ZERO
	if not modal:
		direction = Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if not modal and not Input.is_key_pressed(KEY_CTRL) and not Input.is_key_pressed(KEY_SHIFT):
		for pair in [[KEY_A, Vector2.LEFT], [KEY_D, Vector2.RIGHT], [KEY_W, Vector2.UP], [KEY_S, Vector2.DOWN]]:
			if Input.is_physical_key_pressed(pair[0]):
				direction += pair[1]
	if direction != Vector2.ZERO:
		camera.position += direction.normalized() * 900.0 * delta / camera.zoom.x
		_clamp_camera()
	if sim.advance(delta) > 0:
		_refresh_sim()
	since_upload += delta
	if control_dirty and since_upload >= CONTROL_UPLOAD_EVERY:
		_upload_control()


func _zoom_at(factor: float, screen_point: Vector2) -> void:
	var base := get_viewport_rect().size.x / map_size.x
	var before := get_canvas_transform().affine_inverse() * screen_point
	var zoom := clampf(camera.zoom.x * factor, ZOOM_MIN * base, ZOOM_MAX * base)
	camera.zoom = Vector2(zoom, zoom)
	camera.force_update_scroll()
	var after := get_canvas_transform().affine_inverse() * screen_point
	camera.position += before - after
	_clamp_camera()
	markers.pixel = 1.0 / camera.zoom.x
	markers.queue_redraw()


func _clamp_camera() -> void:
	camera.position = camera.position.clamp(-map_size / 2, map_size / 2)


func _update_hover(screen_point: Vector2) -> void:
	_hover_world(get_canvas_transform().affine_inverse() * screen_point)


## Highlight the region (or country) under a world position and label it:
## "Donetsk Oblast, Ukraine (held by Russia)".
func _hover_world(world: Vector2) -> void:
	var id := _country_at(world)
	var region := _region_at(world)
	if id == hovered_id and region == hovered_region:
		return
	hovered_id = id
	hovered_region = region
	var material := map_rect.material as ShaderMaterial
	material.set_shader_parameter("hovered_id", id)
	material.set_shader_parameter("hovered_region", region)
	var place := ""
	if region > 0:
		var home := scenario.region_home(region)
		place = "%s, %s" % [scenario.region_name(region), scenario.country_name(home)]
		if id > 0 and id != home:
			place += " (held by %s)" % scenario.country_name(id)
	elif id > 0:
		place = scenario.country_name(id)
	if player == 0:
		info.text = scenario.scenario_name() + ("  ·  " + place if place != "" else "")
	else:
		# The small line in the corner: only the place, or nothing.
		info.text = place
		info.visible = place != "" and not no_hud


## Pixel of the cell images under a world position, or (-1, -1) off the map.
func _pixel_at(world: Vector2) -> Vector2i:
	var uv := (world + map_size / 2) / map_size
	if uv.x < 0.0 or uv.x >= 1.0 or uv.y < 0.0 or uv.y >= 1.0:
		return Vector2i(-1, -1)
	var merc := _mercator_y(MAX_LAT) * (1.0 - 2.0 * uv.y)
	var lat := rad_to_deg(atan(sinh(merc)))
	var x := int(uv.x * owners.get_width())
	var y := clampi(int((90.0 - lat) / 180.0 * owners.get_height()), 0, owners.get_height() - 1)
	return Vector2i(x, y)


## Controlling country id under a world position, or -1 for water or off the map.
func _country_at(world: Vector2) -> int:
	var at := _pixel_at(world)
	if at.x < 0:
		return -1
	var pixel := owners.get_pixelv(at)
	if pixel.b < 0.5:
		return -1
	return roundi(pixel.r * 255.0) + roundi(pixel.g * 255.0) * 256


## Region number under a world position, or 0.
func _region_at(world: Vector2) -> int:
	var at := _pixel_at(world)
	if at.x < 0 or not regions:
		return 0
	var pixel := regions.get_pixelv(at)
	return roundi(pixel.r * 255.0) + roundi(pixel.g * 255.0) * 256


func _world_from_lng_lat(lng: float, lat: float) -> Vector2:
	var u := (lng + 180.0) / 360.0
	var v := 0.5 - _mercator_y(clampf(lat, -MAX_LAT, MAX_LAT)) / (2.0 * _mercator_y(MAX_LAT))
	return Vector2(u, v) * map_size - map_size / 2


func _screen_to_world(screen_point: Vector2) -> Vector2:
	return get_canvas_transform().affine_inverse() * screen_point


func _lng_lat_at(screen_point: Vector2) -> Vector2:
	return _lng_lat_from_world(_screen_to_world(screen_point))


func _lng_lat_from_world(world: Vector2) -> Vector2:
	var uv := (world + map_size / 2) / map_size
	var merc := _mercator_y(MAX_LAT) * (1.0 - 2.0 * uv.y)
	return Vector2(uv.x * 360.0 - 180.0, rad_to_deg(atan(sinh(merc))))


func _mercator_y(lat: float) -> float:
	return log(tan(PI / 4.0 + deg_to_rad(lat) / 2.0))


func _parse_args() -> Dictionary:
	if not restart_args.is_empty():
		return restart_args.duplicate()
	var result := {}
	for arg in OS.get_cmdline_user_args():
		var parts := arg.trim_prefix("--").split("=", true, 1)
		result[parts[0]] = parts[1] if parts.size() > 1 else ""
	return result


func _save_screenshot(path: String) -> void:
	for i in 3:
		await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var error := image.save_png(path)
	print("Screenshot %s: %s" % [path, error_string(error)])
	get_tree().quit(0 if error == OK else 1)
