extends SceneTree
## Base for the screen tests: start the game headless, poke it like a
## player would (keys, clicks, buttons) and check what happened. Run them
## all with `native/test-screens.sh`; each prints its failed checks and
## exits with 1 if there were any.

var main: Node
var scenario: MwScenario
var failures := 0


## Start the game on the pick screen, in a 1600x900 window (a headless
## window is tiny otherwise, which makes click radii huge).
func start() -> void:
	root.size = Vector2i(1600, 900)
	main = load("res://main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	scenario = main.scenario


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
	return card.body.get_child(-1).get_children().filter(
		func(c: Node) -> bool: return c is Button or c is PanelContainer)


func finish() -> void:
	var name := (get_script() as Script).resource_path.get_file()
	print("%s: %s" % [name, "ok" if failures == 0 else "%d failed" % failures])
	quit(1 if failures > 0 else 0)
