extends "res://tests/harness.gd"
## The main menu: the game opens on it, Play chooses a scenario (another one
## loads with the scene started again) and observer mode, Continue and Load
## game load any save of any scenario, Quit quits.

var dir := ""
var restarts: Array = []
var quits := 0


func _menu() -> void:
	if main != null:
		main.free()
	await start("", {})
	main.save_dir = dir
	main.restart = func() -> void: restarts.append(main.restart_args.duplicate())
	main.quit_game = func() -> void: quits += 1
	main.main_menu.saves = main._all_saves()
	main.main_menu.show_main()


func _button(name: String) -> Button:
	return main.main_menu.content.find_child(name, true, false)


func _press(name: String) -> void:
	var button := _button(name)
	check(button != null, "a button %s in the %s view" % [name, main.main_menu.view])
	if button != null:
		button.pressed.emit()


func _texts(node: Node) -> Array:
	return node.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)


func _initialize() -> void:
	dir = OS.get_environment("TMPDIR") if OS.has_environment("TMPDIR") else "/tmp"
	dir = dir.path_join("mw-main-menu-test-%d" % OS.get_process_id())
	DirAccess.make_dir_recursive_absolute(dir)

	await _menu()
	var menu: Control = main.main_menu
	check(menu != null and menu.visible and menu.view == "main", "the game opens on the main menu")
	check(main.pick == null and main.player == 0 and main.sim.is_paused(), "nothing started yet")
	check(_button("Play") != null and _button("Quit") != null, "Play and Quit")
	check(_button("Continue") == null and _button("Load") == null, "no saves: no Continue or Load game")
	check(main.credit.visible and main.credit.get_index() == main.ui_layer.get_child_count() - 1,
		"the data credit stays on top")
	key(KEY_SPACE)
	check(main.sim.is_paused(), "keys do not reach the game behind it")

	# Play: a card for each scenario, the first one chosen.
	_press("Play")
	check(menu.view == "play", "Play opens the scenarios")
	var cards: Control = menu.content.find_child("Cards", true, false)
	check(cards != null and cards.get_child_count() == 2, "two scenario cards")
	check(menu.selected == "world-map-2026-v3", "the 2026 world is chosen first")
	var ukraine_card: Control = menu.content.find_child("Card-ukraine-2023-v3", true, false)
	var ukraine_texts := _texts(ukraine_card)
	check(ukraine_texts.has("War under way"), "the Ukraine card says a war is on: %s" % [ukraine_texts])
	check(ukraine_texts.any(func(t: String) -> bool: return t.contains("DeepStateMap")),
		"and keeps its data credit")
	check(ukraine_texts.has("Starts 1 January 2023  ·  Europe and Asia  ·  Russia and Ukraine at war"),
		"with its start date from the package")
	check(_button("Start").text == "Pick a country", "the button picks a country")
	key(KEY_ESCAPE) # the menu takes Esc in _input; the test calls back() like it
	menu.back()
	check(menu.view == "main", "Esc goes back")

	# The same scenario: its pick screen opens in place.
	_press("Play")
	_press("Start")
	check(main.main_menu == null and main.pick != null, "Pick a country opens the pick screen")
	check(restarts.is_empty(), "without starting the scene again")
	check(main.markers.visible, "with the armies on the map")
	# Back: Esc closes a country's card first, then returns to the main menu.
	main._select_at(screen_at(21.0, 52.2), false)
	check(main.pick.card.card.visible, "a country's card")
	key(KEY_ESCAPE)
	check(main.pick != null and not main.pick.card.card.visible, "Esc closes the card")
	key(KEY_ESCAPE)
	check(main.pick == null and main.main_menu != null and main.main_menu.view == "main",
		"then goes back to the main menu")
	_press("Play")
	_press("Start")
	var back: Control = main.pick.find_child("Back", true, false)
	check(back != null, "the pick screen has a Back button")
	back.pressed.emit()
	check(main.pick == null and main.main_menu != null, "Back returns to the main menu")

	# Another scenario: the scene starts again with it, on the pick screen.
	await _menu()
	_press("Play")
	(main.main_menu.content.find_child("Card-ukraine-2023-v3", true, false) as Button).pressed.emit()
	check(main.main_menu.selected == "ukraine-2023-v3", "a click chooses Ukraine 2023")
	_press("Start")
	check(restarts == [{"scenario": "ukraine-2023-v3", "pick": ""}], "it loads with the scene: %s" % [restarts])

	# Observer mode: the AI plays everyone, Esc opens the observer's menu.
	await _menu()
	_press("Play")
	var observer: Button = main.main_menu.content.find_child("Observer", true, false)
	observer.button_pressed = true
	check(main.main_menu.observe and _button("Start").text == "Start watching", "observer mode is on")
	_press("Start")
	var poland := country("Poland")
	check(main.observing and main.main_menu == null and main.pick == null and main.player == 0,
		"watching, with no country")
	check(main.sim.is_ai(poland) and main.sim.is_ai(country("Germany")), "the AI plays every country")
	check(main.clock.visible and main.feed.visible, "the viewer's clock and reports show")
	check(main.menu != null and not main.menu.visible, "a pause menu waits for Esc")
	key(KEY_ESCAPE)
	check(main.menu.visible and main.sim.is_paused(), "Esc opens it")
	var menu_texts := _texts(main.menu.dialog)
	check(menu_texts.has("Observer"), "the observer's menu: %s" % [menu_texts])
	main.menu.back()
	check(not main.menu.visible, "and closes it")

	# Saves: a save leading Poland, and one of Ukraine 2023.
	main.free()
	main = null
	await start()
	main.save_dir = dir
	main._lead(poland, false)
	main.sim.run(5)
	check(main._slots().create(main.sim, "Before the push") == "", "a save leading Poland")
	var saved_time: String = main.sim.time_text()
	var ours: String = main._slots().list()[0]["path"]
	var theirs := dir.path_join("save-ukraine-2023-v3-%d-Ukraine-1.mwsave" % country("Ukraine"))
	DirAccess.copy_absolute(ours, theirs)
	# Older than ours, so Continue loads ours.
	var info := FileAccess.open(theirs.get_basename() + ".json", FileAccess.WRITE)
	info.store_string(JSON.stringify({"name": "Kyiv holds", "time": "2023-01-01 05:00",
		"saved": Time.get_unix_time_from_system() - 3600.0}))
	info.close()

	await _menu()
	check(_button("Continue") != null and _button("Load") != null, "now Continue and Load game")
	var continue_texts := _texts(_button("Continue"))
	check(continue_texts.size() == 2 and continue_texts[1].begins_with("Poland  ·  Modern World 2026")
		and continue_texts[1].contains("Before the push"), "Continue names the newest save: %s" % [continue_texts])
	_press("Load")
	check(main.main_menu.view == "load", "Load game lists the saves")
	var rows: Control = main.main_menu.content.find_child("Rows", true, false)
	check(rows != null and rows.get_child_count() == 2, "both saves")
	var second: Control = rows.get_child(1) if rows != null else null
	check(second != null and _texts(second)[0].begins_with("Ukraine  ·  Ukraine 2023"), "the Ukraine save second")
	(second.find_child("Load", true, false) as Button).pressed.emit()
	check(restarts.size() == 2 and restarts[1] == {"scenario": "ukraine-2023-v3", "load": theirs,
		"lead": str(country("Ukraine"))}, "another scenario's save loads with the scene: %s" % [restarts])

	# Continue: this scenario's save loads in place, leading Poland.
	_press("Back")
	_press("Continue")
	check(main.main_menu == null and main.player == poland, "Continue leads Poland")
	check(main.sim.time_text() == saved_time, "in the saved game: %s" % main.sim.time_text())
	check(main.sim.is_paused() and main.top_bar != null, "paused, with the top bar")

	# Quit to desktop.
	await _menu()
	_press("Quit")
	check(quits == 1, "Quit quits")

	for file in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir.path_join(file))
	DirAccess.remove_absolute(dir)
	finish()
