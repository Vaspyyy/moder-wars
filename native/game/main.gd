extends Node2D
## First native screen: loads a real scenario through the Rust extension,
## draws the political map with a shader and runs the simulation on it.
## Pan by dragging with any mouse button or with WASD/arrows, zoom with the
## wheel or +/-. Space pauses and resumes, 1-5 set the speed.
##
## Armies: click a division to select it, or its whole army group if it is in
## one (Shift-click adds or removes single divisions). G makes the selection an
## army group. F then a left-drag draws the selected group's front along a
## border; R then a left-drag draws its arrow into enemy land; X removes the
## arrow. Right-click sends the selected divisions somewhere directly, which
## takes them out of their group. Esc cancels drawing, then clears the
## selection. Orders take effect at once, even while paused.
##
## Economy (stand-in controls): with a division selected, B cycles its
## country's budget (peace, war, all-out) and M its mobilization level.
## AI: I hands the selected division's country to the AI or takes it back
## (with --ai both sides of the sandbox war start on the AI).
## War and peace (stand-in controls): W makes the selected division's country
## declare war on the country under the mouse, P makes it offer peace to all
## its enemies, and Y or N accepts or refuses the newest open peace offer on
## behalf of the country it was made to.
##
## Command-line options (after `--`):
##   --scenario=<name>        package in assets/maps/compiled (default world-map-2026-v3)
##   --view=<lng>,<lat>,<zoom> start the camera here
##   --war=<attacker>,<defender>[,<attackers>,<defenders>]
##                            sandbox war along their border, with that many
##                            divisions a side (default 24 and 12)
##   --seed=<n>               simulation seed (default 1)
##   --speed=<1-5>            starting speed
##   --play                   start running (the game starts paused)
##   --ai                     hand both sides of the --war sandbox to the AI
##   --forces                 every country starts with its real army (World Bank
##                            data); --war then only declares the war
##   --run=<hours>            run the simulation this long before showing it
##   --select=<id>,...        select these divisions, or their army groups (for screenshots)
##   --screenshot=<path>      save one frame as PNG and quit (for headless checks)
##   --no-hud                 hide the labels (clean map pictures)
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


func _ready() -> void:
	var args := _parse_args()
	var name: String = args.get("scenario", "world-map-2026-v3")
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
	var layer := CanvasLayer.new()
	layer.visible = not _parse_args().has("no-hud")
	add_child(layer)
	for label in [info, credit, clock, feed, details, help]:
		label.add_theme_color_override("font_outline_color", Color.BLACK)
		label.add_theme_constant_override("outline_size", 6)
		layer.add_child(label)
	info.position = Vector2(16, 12)
	info.add_theme_font_size_override("font_size", 22)
	info.text = scenario.scenario_name()
	# License requirement: the data credit stays visible.
	credit.text = scenario.attribution()
	credit.add_theme_font_size_override("font_size", 14)
	credit.anchor_top = 1.0
	credit.anchor_bottom = 1.0
	credit.position = Vector2(16, get_viewport_rect().size.y - 30)
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
	help.position = Vector2(screen.x - 816, screen.y - 50)
	help.size = Vector2(800, 40)
	_show_help()


## Start the simulation, with the sandbox war from --war if given.
func _start_sim(args: Dictionary) -> void:
	sim.start(scenario, int(args.get("seed", "1")))
	if args.has("forces"):
		var error := sim.deploy_forces(ProjectSettings.globalize_path("res://").path_join(
			"../../assets/data/forces/world-bank.json.gz"))
		if error != "":
			push_error("--forces: " + error)
		else:
			# License requirement (CC BY 4.0): the force data credit stays visible.
			credit.text += "  ·  Forces: World Bank, IISS (CC BY 4.0)"
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
	for group in sim.groups():
		for key in ["front", "arrow"]:
			var points := PackedVector2Array()
			for point in PackedVector2Array(group[key]):
				points.append(_world_from_lng_lat(point.x, point.y))
			group[key] = points
		markers.groups.append(group)
	var changes := sim.control_changes()
	for i in range(0, changes.size(), 3):
		var country := changes[i + 2]
		owners.set_pixel(changes[i], changes[i + 1], Color8(country & 255, country >> 8, 255, 255))
	if changes.size() > 0:
		control_dirty = true
		hovered_id = -2 # the label may name a new holder
	for line in sim.take_events():
		_add_feed(line)
	_show_feed()
	var state := "Paused" if sim.is_paused() else "Speed %d" % sim.speed()
	clock.text = "%s   %s" % [sim.time_text(), state]
	_show_details()


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
	for i in range(0, data.size(), stride):
		if not markers.selected.has(int(data[i])):
			continue
		var flags := int(data[i + 6])
		var state := "fighting" if flags & MwWorld.IN_BATTLE else (
			"marching" if flags & MwWorld.MOVING else "holding")
		if not flags & MwWorld.SUPPLIED:
			state += ", cut off"
		lines.append("%s division %d  ·  %d%% strength  ·  %d%% morale  ·  %s" % [
			scenario.country_name(int(data[i + 1])), int(data[i]),
			roundi(data[i + 4] * 100.0), roundi(data[i + 5] * 100.0), state])
	if lines.size() > 1:
		lines = PackedStringArray(["%d divisions selected" % lines.size()])
	var country := _selected_country()
	if country != 0:
		var e: Dictionary = sim.economy(country)
		var budget := "%d%% recruiting, %d%% equipment" % [e["recruiting"], e["equipment"]]
		for i in BUDGETS.size():
			if BUDGETS[i][0] == int(e["recruiting"]) and BUDGETS[i][1] == int(e["equipment"]):
				budget = BUDGET_NAMES[i]
		lines.append("%s%s  ·  income $%.2f bn a day  ·  %s  ·  %s  ·  %s men to draft" % [
			scenario.country_name(country), " (AI)" if sim.is_ai(country) else "",
			float(e["income_k"]) / 1e6, budget,
			MOBILIZATION_NAMES[int(e["mobilization"])], _thousands(int(e["manpower"]))])
	details.text = "\n".join(lines)
	details.position.y = get_viewport_rect().size.y - 36 - 22 * lines.size()


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
	match drawing:
		"front":
			help.text = "Drawing a front: drag along the border with the left mouse button  ·  Esc cancels"
		"arrow":
			help.text = "Drawing an arrow: drag from the front into enemy land  ·  Esc cancels"
		_:
			help.text = ("Space pause  ·  1-5 speed  ·  click select  ·  right-click move  ·  "
				+ "G group  ·  F front  ·  R arrow  ·  X drop arrow\n"
				+ "B budget  ·  M mobilize  ·  W war  ·  P peace  ·  Y/N answer  ·  I AI on/off  ·  Esc clear")


## Click: select a division, or its whole army group. Shift-click adds or
## removes one division and leaves group selection.
func _select_at(screen_point: Vector2, add: bool) -> void:
	var world := get_canvas_transform().affine_inverse() * screen_point
	var id: int = markers.pick(world, 12.0)
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
		_add_feed("Select divisions or an army group first")
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
	if markers.selected.is_empty():
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
			MOUSE_BUTTON_LEFT when drawing != "":
				if button.pressed:
					stroke_points = PackedVector2Array([_lng_lat_at(button.position)])
					markers.stroke = PackedVector2Array([_screen_to_world(button.position)])
					markers.stroke_is_arrow = drawing == "arrow"
				else:
					_finish_drawing()
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
		elif dragging:
			camera.position -= motion.relative / camera.zoom
			_clamp_camera()
		_update_hover(motion.position)
	elif event is InputEventKey and event.pressed:
		var key := (event as InputEventKey).keycode
		if key == KEY_EQUAL or key == KEY_KP_ADD:
			_zoom_at(1.25, get_viewport_rect().size / 2)
		elif key == KEY_MINUS or key == KEY_KP_SUBTRACT:
			_zoom_at(0.8, get_viewport_rect().size / 2)
		elif key == KEY_SPACE:
			sim.toggle_pause()
			_refresh_sim()
		elif key >= KEY_1 and key <= KEY_5:
			sim.set_speed(key - KEY_0)
			_refresh_sim()
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
		elif key == KEY_B and _selected_country() != 0:
			var country := _selected_country()
			var now: Dictionary = sim.economy(country)
			var next := 0
			for i in BUDGETS.size():
				if BUDGETS[i][0] == int(now["recruiting"]) and BUDGETS[i][1] == int(now["equipment"]):
					next = (i + 1) % BUDGETS.size()
			sim.set_budget(country, BUDGETS[next][0], BUDGETS[next][1])
			_refresh_sim()
		elif key == KEY_M and _selected_country() != 0:
			var country := _selected_country()
			sim.set_mobilization(country, (int(sim.economy(country)["mobilization"]) + 1) % 4)
			_refresh_sim()
		elif key == KEY_I and _selected_country() != 0:
			var country := _selected_country()
			var on := not sim.is_ai(country)
			sim.set_ai(country, on)
			_add_feed(("%s is now run by the AI" if on else "%s takes orders from you again")
				% scenario.country_name(country))
			_refresh_sim()
		elif key == KEY_W and _selected_country() != 0 and hovered_id > 0:
			sim.declare_war(_selected_country(), hovered_id)
			_refresh_sim()
		elif key == KEY_P and _selected_country() != 0:
			if sim.offer_peace(_selected_country()) == 0:
				_add_feed("%s is at war with nobody" % scenario.country_name(_selected_country()))
			_refresh_sim()
		elif key == KEY_Y or key == KEY_N:
			var newest: Dictionary = {}
			for offer in sim.peace_offers():
				if newest.is_empty() or int(offer["tick"]) >= int(newest["tick"]):
					newest = offer
			if newest.is_empty():
				_add_feed("No open peace offers")
			else:
				sim.answer_peace(int(newest["from"]), int(newest["to"]), key == KEY_Y)
			_refresh_sim()
		elif key == KEY_X and markers.selected_group != 0:
			sim.draw_arrow(markers.selected_group, PackedVector2Array())
			_refresh_sim()
		elif key == KEY_ESCAPE:
			if drawing != "":
				drawing = ""
				stroke_points.clear()
				markers.stroke.clear()
				_show_help()
			else:
				markers.selected.clear()
				markers.selected_group = 0
			_refresh_sim()


func _process(delta: float) -> void:
	var direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
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
	var text := scenario.scenario_name()
	if region > 0:
		var home := scenario.region_home(region)
		text += "  ·  %s, %s" % [scenario.region_name(region), scenario.country_name(home)]
		if id > 0 and id != home:
			text += " (held by %s)" % scenario.country_name(id)
	elif id > 0:
		text += "  ·  " + scenario.country_name(id)
	info.text = text


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
