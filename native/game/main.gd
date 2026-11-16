extends Node2D
## First native screen: loads a real scenario through the Rust extension and
## draws the political map with a shader. Pan with any mouse button or
## WASD/arrows, zoom with the wheel or +/-.
##
## Command-line options (after `--`):
##   --scenario=<name>        package in assets/maps/compiled (default world-map-2026-v3)
##   --view=<lng>,<lat>,<zoom> start the camera here
##   --screenshot=<path>      save one frame as PNG and quit (for headless checks)
##   --probe=<lng>,<lat>;...  print the country and region under each point and quit
##   --hover=<lng>,<lat>      show the hover label for this point (for screenshots)

const MAX_LAT := 85.0511
const ZOOM_MIN := 0.25
const ZOOM_MAX := 40.0

var scenario := MwScenario.new()
var owners: Image
var regions: Image
var map_size := Vector2.ZERO
var map_rect := ColorRect.new()
var camera := Camera2D.new()
var info := Label.new()
var credit := Label.new()
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
	if args.has("screenshot"):
		set_process_unhandled_input(false) # keep the picture repeatable
		_save_screenshot(args["screenshot"])


func _build_map() -> void:
	var width := float(owners.get_width())
	# Web Mercator from -MAX_LAT to +MAX_LAT, one unit per cell at the equator.
	map_size = Vector2(width, width * _mercator_y(MAX_LAT) / PI)
	var material := ShaderMaterial.new()
	material.shader = preload("res://map.gdshader")
	material.set_shader_parameter("owners", ImageTexture.create_from_image(owners))
	material.set_shader_parameter("palette", ImageTexture.create_from_image(scenario.palette_image()))
	material.set_shader_parameter("max_lat", MAX_LAT)
	if regions:
		material.set_shader_parameter("regions", ImageTexture.create_from_image(regions))
		material.set_shader_parameter("has_regions", true)
	map_rect.material = material
	map_rect.size = map_size
	map_rect.position = -map_size / 2
	map_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(map_rect)
	add_child(camera)


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	for label in [info, credit]:
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


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		match button.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				_zoom_at(1.15, button.position)
			MOUSE_BUTTON_WHEEL_DOWN:
				_zoom_at(1.0 / 1.15, button.position)
			MOUSE_BUTTON_LEFT, MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT:
				dragging = button.pressed
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if dragging:
			camera.position -= motion.relative / camera.zoom
			_clamp_camera()
		_update_hover(motion.position)
	elif event is InputEventKey and event.pressed:
		var key := (event as InputEventKey).keycode
		if key == KEY_EQUAL or key == KEY_KP_ADD:
			_zoom_at(1.25, get_viewport_rect().size / 2)
		elif key == KEY_MINUS or key == KEY_KP_SUBTRACT:
			_zoom_at(0.8, get_viewport_rect().size / 2)


func _process(delta: float) -> void:
	var direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	for pair in [[KEY_A, Vector2.LEFT], [KEY_D, Vector2.RIGHT], [KEY_W, Vector2.UP], [KEY_S, Vector2.DOWN]]:
		if Input.is_physical_key_pressed(pair[0]):
			direction += pair[1]
	if direction != Vector2.ZERO:
		camera.position += direction.normalized() * 900.0 * delta / camera.zoom.x
		_clamp_camera()


func _zoom_at(factor: float, screen_point: Vector2) -> void:
	var base := get_viewport_rect().size.x / map_size.x
	var before := get_canvas_transform().affine_inverse() * screen_point
	var zoom := clampf(camera.zoom.x * factor, ZOOM_MIN * base, ZOOM_MAX * base)
	camera.zoom = Vector2(zoom, zoom)
	camera.force_update_scroll()
	var after := get_canvas_transform().affine_inverse() * screen_point
	camera.position += before - after
	_clamp_camera()


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
