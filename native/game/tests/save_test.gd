extends "res://tests/harness.gd"
## Quick save and load: one slot per led country, so a save made leading
## one country never loads into a game leading another (that would hand
## your country to the AI and leave the saved one with no one running it),
## and a load clears what belonged to the game before it.

var dir := ""


func _lead_fresh(name: String) -> int:
	if main != null:
		main.free()
	await start()
	main.save_dir = dir
	var id := country(name)
	main._lead(id, false)
	return id


func _initialize() -> void:
	dir = OS.get_environment("TMPDIR") if OS.has_environment("TMPDIR") else "/tmp"
	dir = dir.path_join("mw-save-test-%d" % OS.get_process_id())
	DirAccess.make_dir_recursive_absolute(dir)

	var poland := await _lead_fresh("Poland")
	var saved_at: String = main.sim.time_text()
	key(KEY_F5)
	var slot := "quicksave-world-map-2026-v3-%d-Poland.mwsave" % poland
	check(FileAccess.file_exists(dir.path_join(slot)), "F5 saves into Poland's slot in this scenario")
	main.sim.run(30)
	check(main.sim.time_text() != saved_at, "time goes on")
	main.cards.append({"big": "war", "other": country("Germany")})
	main._show_country_card(country("Germany"), main._world_from_lng_lat(10.0, 51.0))
	check(main.country_card.card.visible, "a country card is open")
	key(KEY_F9)
	check(main.sim.time_text() == saved_at, "F9 goes back to the save")
	check(not main.sim.is_ai(poland), "and Poland is still yours")
	check(main.cards.is_empty() and not main.event_card.visible, "cards from before the load are dropped")
	check(not main.country_card.card.visible, "and an open country card closes")
	check(main.reports.entries.size() == 1 and main.reports.entries[0][0] == "Game loaded",
		"the reports start over: %s" % [main.reports.entries])

	# A peace offer waiting in the saved game opens the peace window again.
	var germany := country("Germany")
	main.sim.declare_war(germany, poland)
	main.sim.offer_peace_to(germany, poland)
	main.sim.take_reports() # no card now: the offer is only in the save
	main.sim.save_game(main._quicksave_path())
	main._quickload()
	main._refresh_sim()
	check(main.peace_window.visible and main.peace_window.incoming and main.peace_with == germany,
		"a peace offer in the save waits for an answer")
	key(KEY_N)
	check(not main.peace_window.visible, "and can be refused")
	# The viewer has a slot of its own, apart from every led country's.
	main.player = 0
	check(main._quicksave_path().get_file() == "quicksave-world-map-2026-v3-viewer.mwsave", "the viewer's slot")
	main.player = poland

	# Leading another country: Poland's save is not this game's.
	var ukraine := await _lead_fresh("Ukraine")
	main.sim.run(5)
	var now: String = main.sim.time_text()
	key(KEY_F9)
	check(main.sim.time_text() == now, "no save for Ukraine: nothing loads")
	check(not main.sim.is_ai(ukraine), "and Ukraine stays yours")
	check(main.sim.is_ai(poland), "and Poland stays with the AI")
	check(main.reports.entries.any(func(entry: Array) -> bool: return entry[0] == "No quick save for Ukraine yet: F5 makes one"),
		"it says there is no quick save for Ukraine yet")

	for file in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir.path_join(file))
	DirAccess.remove_absolute(dir)
	finish()
