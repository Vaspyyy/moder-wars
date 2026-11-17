extends "res://tests/harness.gd"
## The pause menu: Esc opens it once nothing else is open, it pauses the
## game, Saves makes, overwrites, deletes and loads named saves, and New
## game and Quit ask "Leave this game?" only when the game changed since
## the last save.

var dir := ""
var restarts := 0
var quits := 0


func _lead_fresh(name: String) -> int:
	if main != null:
		main.free()
	await start()
	main.save_dir = dir
	main.restart = func() -> void: restarts += 1
	main.quit_game = func() -> void: quits += 1
	var id := country(name)
	main._lead(id, false)
	return id


func _press(path: String) -> void:
	var button: Button = main.menu.dialog.find_child(path, true, false)
	check(button != null, "a button %s in the %s view" % [path, main.menu.view])
	if button != null:
		button.pressed.emit()


func _row(id: String) -> Control:
	return main.menu.dialog.find_child(id, true, false)


func _press_in(row: String, button: String) -> void:
	var found: Control = _row(row)
	check(found != null, "a row %s" % row)
	if found != null:
		var pressed: Button = found.find_child(button, true, false)
		check(pressed != null, "a button %s in row %s" % [button, row])
		if pressed != null:
			pressed.pressed.emit()


func _row_name(id: String) -> String:
	var found: Control = _row(id)
	return (found.find_child("Name", true, false) as Label).text if found != null else ""


func _initialize() -> void:
	dir = OS.get_environment("TMPDIR") if OS.has_environment("TMPDIR") else "/tmp"
	dir = dir.path_join("mw-menu-test-%d" % OS.get_process_id())
	DirAccess.make_dir_recursive_absolute(dir)
	var poland := await _lead_fresh("Poland")
	var menu: Control = main.menu

	# Esc with nothing open opens the menu and pauses a running game.
	main.sim.toggle_pause()
	check(not main.sim.is_paused(), "the game runs")
	key(KEY_A, false, true)
	check(not main.markers.selected.is_empty(), "Ctrl+A selects the army")
	key(KEY_ESCAPE)
	check(not menu.visible and main.markers.selected.is_empty(), "the first Esc clears the selection")
	key(KEY_ESCAPE)
	check(menu.visible and menu.view == "menu", "the next one opens the menu")
	check(main.sim.is_paused(), "and pauses the game")
	key(KEY_SPACE)
	check(main.sim.is_paused(), "Space does nothing while it is open")
	key(KEY_B)
	check(not main.economy_window.visible, "nor does B")
	key(KEY_ESCAPE)
	check(not menu.visible and not main.sim.is_paused(), "Esc closes it and the game runs again")
	main.sim.toggle_pause()
	key(KEY_ESCAPE)
	_press("Continue")
	check(not menu.visible and main.sim.is_paused(), "Continue closes it; a paused game stays paused")

	# Saves: make a named save.
	key(KEY_ESCAPE)
	_press("Saves")
	check(menu.view == "saves", "Saves opens the list")
	check(menu.name_box.text == "%s, %s" % [main.Style.long_date(main._today()),
		main.sim.time_text().get_slice(" ", 1)], "a name is suggested: %s" % menu.name_box.text)
	check(_row("Row0") == null and _row("Quick") == null, "no saves yet")
	await process_frame
	var orphans := Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)
	for i in 3:
		menu.show_saves(main._menu_state())
	await process_frame
	await process_frame
	check(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT) == orphans,
		"showing an empty list leaves no nodes behind")
	menu.name_box.text = "  Before the push  "
	_press("Save")
	var slots = main._slots()
	var saves: Array = slots.list()
	check(saves.size() == 1 and saves[0]["name"] == "Before the push", "a named save: %s" % [saves])
	var first: String = saves[0]["path"] if saves.size() > 0 else ""
	check(FileAccess.file_exists(first) and FileAccess.file_exists(first.get_basename() + ".json"),
		"its file and its name file")
	check(menu.view == "saves" and _row_name("Row0") == "Before the push", "the list shows it")
	check(saves[0]["time"] == main.sim.time_text(), "with the time in the game")
	menu.name_box.text = "   "
	_press("Save")
	check(slots.list().size() == 1, "a save needs a name")

	# Nothing changed since: New game and Quit do not ask.
	menu.back()
	check(menu.view == "menu", "Esc goes back to the menu")
	_press("NewGame")
	check(restarts == 1 and menu.view == "menu", "New game right away with nothing to lose")
	_press("Quit")
	check(quits == 1, "and Quit")

	# Time went on: they ask first.
	main.sim.run(5)
	_press("NewGame")
	check(restarts == 1 and menu.view == "leave", "a changed game asks before New game")
	_press("Stay")
	check(menu.view == "menu" and restarts == 1, "Stay goes back to the menu")
	_press("Quit")
	check(menu.view == "leave" and quits == 1, "and before Quit")
	_press("Leave")
	check(quits == 2, "Leave without saving quits")
	# An order given while paused is a change too.
	main.sim.load_game(first)
	main.saved_hash = main.sim.state_hash()
	main.sim.set_budget(poland, 40, 20)
	check(main._unsaved(), "an order while paused counts as a change")

	# Overwrite asks once in its row, then saves the game as it is now.
	main.sim.run(7)
	menu.show_menu(main._menu_state())
	_press("Saves")
	_press_in("Row0", "Overwrite")
	check(_row("Row0").find_child("ConfirmOverwrite", true, false) != null, "Overwrite asks first")
	check(slots.list()[0]["time"] != main.sim.time_text(), "and has not saved yet")
	_press_in("Row0", "ConfirmOverwrite")
	saves = slots.list()
	check(saves.size() == 1 and saves[0]["path"] == first and saves[0]["name"] == "Before the push",
		"the same save, same name")
	check(saves[0]["time"] == main.sim.time_text(), "now holding this hour")
	check(not main._unsaved(), "and the game counts as saved")

	# A second save goes on top; Delete asks once, Esc takes the question back.
	main.sim.run(3)
	menu.name_box.text = "Second"
	_press("Save")
	check(_row_name("Row0") == "Second" and _row_name("Row1") == "Before the push",
		"newest first: %s, %s" % [_row_name("Row0"), _row_name("Row1")])
	_press_in("Row1", "Delete")
	check(_row("Row1").find_child("ConfirmDelete", true, false) != null, "Delete asks first")
	key(KEY_ESCAPE)
	check(menu.view == "saves" and _row("Row1").find_child("ConfirmDelete", true, false) == null,
		"Esc takes the question back")
	_press_in("Row1", "Delete")
	_press_in("Row1", "ConfirmDelete")
	saves = slots.list()
	check(saves.size() == 1 and saves[0]["name"] == "Second", "the old save is gone")
	check(not FileAccess.file_exists(first) and not FileAccess.file_exists(first.get_basename() + ".json"),
		"with its name file")

	# F5 in the menu: the quick save joins the list.
	key(KEY_F5)
	check(_row("Quick") != null and _row_name("Quick") == "Quick save", "the quick save is listed")
	menu.back()
	var saves_button: Button = menu.dialog.find_child("Saves", true, false)
	check(saves_button != null and saves_button.find_children("*", "Label", true, false).any(
		func(l: Label) -> bool: return l.text.ends_with("2 saves")), "the menu counts 2 saves")

	# Load: back to the save, paused, the menu closed, even when the game ran
	# before the menu opened.
	var saved_at: String = saves[0]["time"]
	main.sim.run(30)
	menu.back()
	check(not menu.visible, "Esc in the menu closes it")
	main.sim.toggle_pause()
	key(KEY_ESCAPE)
	check(menu.visible and main.paused_by_menu, "the menu paused the running game")
	_press("Saves")
	_press_in("Row0", "Load")
	check(main.sim.time_text() == saved_at, "Load goes back to the save")
	check(not menu.visible and main.sim.is_paused(), "the menu closes and the game waits, paused")
	check(not main.sim.is_ai(poland), "Poland is still yours")
	check(not main._unsaved(), "a loaded game counts as saved")

	# Typing in the name box goes to the box, and Esc still goes back.
	main.sim.toggle_pause()
	key(KEY_ESCAPE)
	_press("Saves")
	await process_frame
	check(menu.name_box.has_focus(), "the name box has the keys")
	var typed := InputEventKey.new()
	typed.keycode = KEY_B
	typed.unicode = "b".unicode_at(0)
	typed.pressed = true
	root.push_input(typed)
	check(menu.name_box.text == "b" and not main.economy_window.visible,
		"B types into the box: %s" % menu.name_box.text)
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	root.push_input(escape)
	check(menu.visible and menu.view == "menu", "Esc goes back one step, not two")
	root.push_input(escape)
	check(not menu.visible and not main.sim.is_paused(), "and then to the running game")
	main.sim.toggle_pause()

	# F5 and F9 still work while the name box has the keys; a typed name
	# stays while a row asks.
	key(KEY_ESCAPE)
	_press("Saves")
	await process_frame
	main.sim.run(4)
	var f5 := InputEventKey.new()
	f5.keycode = KEY_F5
	f5.pressed = true
	root.push_input(f5)
	check(slots.quick().get("time") == main.sim.time_text(), "F5 saves with the name box focused")
	menu.name_box.text = "Before Moscow"
	menu.name_box.text_changed.emit("Before Moscow")
	_press_in("Row0", "Delete")
	_press_in("Row0", "Cancel")
	check(menu.name_box.text == "Before Moscow", "the typed name stays: %s" % menu.name_box.text)
	var quick_time: String = slots.quick()["time"]
	main.sim.run(6)
	var f9 := InputEventKey.new()
	f9.keycode = KEY_F9
	f9.pressed = true
	root.push_input(f9)
	check(main.sim.time_text() == quick_time, "F9 in the menu loads the quick save")
	check(not menu.visible and main.sim.is_paused(), "closes the menu and waits")

	# Closing the window: asks when unsaved, F5 there goes back to the
	# menu, and a saved game closes at once.
	main.sim.run(2)
	main._notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
	check(menu.visible and menu.view == "leave" and quits == 2, "closing the window with changes asks")
	key(KEY_F5)
	check(menu.view == "menu", "F5 saves and goes back to the menu")
	main._notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
	check(quits == 3, "a saved game closes at once")
	menu.back()

	# A load from the menu opened over the peace window closes it, and the
	# loaded game waits, paused.
	var germany := country("Germany")
	main.sim.toggle_pause()
	main.sim.declare_war(germany, poland)
	main._refresh_sim()
	main._close_card()
	main.sim.offer_peace_to(germany, poland)
	main._refresh_sim()
	check(main.peace_window.visible and main.sim.is_paused(), "a peace offer waits")
	main._notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
	check(menu.visible and menu.view == "leave", "closing the window asks over it")
	_press("Stay")
	_press("Saves")
	_press_in("Row0", "Load")
	check(not main.peace_window.visible and not menu.visible, "the load closes the old peace window")
	check(main.sim.is_paused() and not main.paused_by_card, "and the loaded game waits, paused")
	check(not (main.map_rect.material as ShaderMaterial).get_shader_parameter("has_marks"),
		"without its stripes on the map")
	check(main.army_list.visible and main.reports.visible, "the panels are back")
	key(KEY_ESCAPE)
	check(menu.visible, "and Esc opens the menu again")
	var camera_at: Vector2 = main.camera.position
	Input.action_press("ui_left")
	main._process(0.2)
	Input.action_release("ui_left")
	check(main.camera.position == camera_at, "the arrow keys do not pan behind the menu")
	menu.back()
	Input.action_press("ui_left")
	main._process(0.2)
	Input.action_release("ui_left")
	check(main.camera.position != camera_at, "but do once it is closed")

	# A save of another scenario never lists.
	var listed: int = slots.list().size()
	DirAccess.copy_absolute(slots.list()[0]["path"],
		dir.path_join("save-ukraine-2023-v3-%d-Poland-1.mwsave" % poland))
	check(slots.list().size() == listed, "another scenario's save is not listed")

	# When a save was made.
	var bias := int(Time.get_time_zone_from_system().get("bias", 0)) * 60
	var noon := Time.get_unix_time_from_datetime_dict({"year": 2026, "month": 11, "day": 17,
		"hour": 12, "minute": 0, "second": 0}) - bias
	for case in [[noon - 20, "saved just now"], [noon - 61, "saved 1 minute ago"],
			[noon - 125, "saved 2 minutes ago"], [noon - 3 * 3600, "saved today, 09:00"],
			[noon - 86400 - 1800, "saved 16 November, 11:30"],
			[noon - 365 * 86400, "saved 17 November 2025, 12:00"]]:
		var said: String = main.PauseMenu.saved_text(case[0], noon)
		check(said == case[1], "%s, not %s" % [case[1], said])
	# With the local time kept in the save, a save from before the clocks
	# changed shows the hour it was made.
	var said_local: String = main.PauseMenu.saved_text(noon - 7200, noon, "2026-03-29T01:30:00",
		"2026-03-29T04:00:00")
	check(said_local == "saved today, 01:30", said_local)
	said_local = main.PauseMenu.saved_text(noon - 86400, noon, "2026-10-24T23:10:00",
		"2026-10-25T23:00:00")
	check(said_local == "saved 24 October, 23:10", said_local)

	# Leading another country: Poland's saves are not listed.
	await _lead_fresh("Ukraine")
	main.menu.show_menu(main._menu_state())
	_press("Saves")
	check(_row("Row0") == null and _row("Quick") == null, "Ukraine has no saves yet")

	# Main menu starts over on the main menu.
	main.restart = func() -> void: main.get_tree().reload_current_scene()
	current_scene = main
	var old := main.get_instance_id()
	main.sim.run(2)
	main.menu.show_menu(main._menu_state())
	_press("NewGame")
	_press("Leave")
	for i in 5:
		await process_frame
	check(current_scene.get_instance_id() != old and current_scene.main_menu != null
		and current_scene.pick == null and current_scene.player == 0, "Main menu opens the main menu")
	check(current_scene.restart_args == {"scenario": "world-map-2026-v3"}, "with the same scenario behind it")
	main = current_scene
	main.restart_args = {}
	main.quit_game = func() -> void: quits += 1
	main._notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
	check(quits == 4, "the main menu closes at once")

	for file in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir.path_join(file))
	DirAccess.remove_absolute(dir)
	finish()
