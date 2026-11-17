extends SceneTree
## Base for the screen tests: start the game headless, poke it like a
## player would (keys, clicks, buttons) and check what happened. Run them
## all with `native/test-screens.sh`; each prints its failed checks and
## exits with 1 if there were any.

const Main := preload("res://main.gd")
const Settings := preload("res://settings.gd")

var main: Node
var scenario: MwScenario
var failures := 0


## Start the game in a 1600x900 window (a headless window is tiny
## otherwise, which makes click radii huge) with this scenario's package
## (default: the 2026 world), on the pick screen unless `options` (the
## game's command-line options) say otherwise: {} opens the main menu.
## Real alliances are off unless `options` has "alliances": "on".
func start(scenario_name := "", options := {"pick": ""}) -> void:
	root.size = Vector2i(1600, 900)
	var args: Dictionary = options.duplicate()
	if scenario_name != "":
		args["scenario"] = scenario_name
	# The game setup lives in a scratch file, never the player's; without
	# real alliances unless a test asks for them.
	var tmp := OS.get_environment("TMPDIR") if OS.has_environment("TMPDIR") else "/tmp"
	Settings.path = tmp.path_join("mw-settings-%d.cfg" % OS.get_process_id())
	if not args.has("alliances"):
		args["alliances"] = "off"
	Settings.set_real_alliances(args["alliances"] != "off")
	# The main menu needs some option set, or the command line's count.
	Main.restart_args = args if not args.is_empty() else {"scenario": "world-map-2026-v3"}
	main = load("res://main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	Main.restart_args = {} # read by _ready, which runs once the tree does
	scenario = main.scenario
	# No AI war of its own may interrupt a test with a card.
	main.sim.set_ai_wars(false)
	main.ai_factions = false # nor an invitation into a faction, also after a load
	main.sim.set_ai_factions(false)


func country(name: String) -> int:
	return scenario.country_id(name)


func check(ok: bool, what: String) -> void:
	if not ok:
		print("FAILED: ", what)
		failures += 1


func key(code: Key, shift := false, ctrl := false) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	event.shift_pressed = shift
	event.ctrl_pressed = ctrl
	main._unhandled_input(event)


## Where a map point is on screen now.
func screen_at(lng: float, lat: float) -> Vector2:
	return main.get_canvas_transform() * main._world_from_lng_lat(lng, lat)


## Look at a place at a fixed zoom, so clicks land where expected.
func look_at(lng: float, lat: float, zoom: float) -> void:
	await create_timer(0.8).timeout # let a camera move finish
	main.camera.zoom = Vector2(zoom, zoom)
	main.camera.position = main._world_from_lng_lat(lng, lat)
	await process_frame
	main._refresh_sim() # the click radius follows the zoom


## The buttons on the last row of a card.
func card_buttons(card: Control) -> Array:
	var row: Node = card.body.find_child("Buttons", false, false)
	if row == null:
		row = card.body.get_child(-1)
	return row.get_children().filter(
		func(c: Node) -> bool: return c is Button or c is PanelContainer)


func finish() -> void:
	DirAccess.remove_absolute(Settings.path)
	var name := (get_script() as Script).resource_path.get_file()
	print("%s: %s" % [name, "ok" if failures == 0 else "%d failed" % failures])
	quit(1 if failures > 0 else 0)
