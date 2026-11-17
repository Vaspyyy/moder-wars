extends "res://tests/harness.gd"
## The pick screen: paused, a click shows a country's card, Lead takes it.


func _initialize() -> void:
	await start()
	var poland := country("Poland")
	var germany := country("Germany")
	check(main.pick != null, "the game opens on the pick screen")
	check(main.sim.is_paused(), "paused")
	main._select_at(screen_at(21.0, 52.2), false)
	check(main.pick.country == poland and main.pick.card.card.visible, "a click on Warsaw shows Poland's card")
	key(KEY_SPACE)
	check(main.sim.is_paused(), "Space does not start the game on the pick screen")
	main._select_at(screen_at(-30.0, 45.0), false)
	check(not main.pick.card.card.visible, "a click on the sea hides the card")
	main._select_at(screen_at(21.0, 52.2), false)
	main.pick.lead_pressed.emit(main.pick.country)
	await process_frame
	check(main.player == poland and main.pick == null and main.top_bar != null, "Lead takes Poland")
	check(not main.sim.is_ai(poland) and main.sim.is_ai(germany), "the AI runs everyone else")
	check(main.top_bar.status.text == "At peace", "the top bar says at peace")
	check(main.top_bar.values["Divisions"].text == "11", "11 divisions")
	check(main.top_bar.date.text == "21 October 2026", "the start date")
	main.top_bar.pause_pressed.emit()
	check(not main.sim.is_paused(), "the pause button starts the game")
	main.top_bar.speed_pressed.emit(4)
	check(main.sim.speed() == 4, "a speed bar sets the speed")
	await look_at(12.0, 51.0, 2.0)
	var german := -1
	var polish := -1
	for id in main.markers.countries:
		if main.markers.countries[id] == germany and main.markers.positions[id].x < main._world_from_lng_lat(8.0, 0.0).x:
			german = id
		if main.markers.countries[id] == poland:
			polish = id
	main._select_at(main.get_canvas_transform() * main.markers.positions[german], false)
	check(german >= 0 and main.markers.selected.is_empty(), "a German division cannot be selected")
	main._select_at(main.get_canvas_transform() * main.markers.positions[polish], false)
	check(main.markers.selected.has(polish), "a Polish one can")
	main._hover_world(main._world_from_lng_lat(10.0, 51.0))
	key(KEY_W)
	check(main.sim.enemies(poland).is_empty(), "W over Germany only pans")
	key(KEY_W, true)
	check(main.sim.enemies(poland).has(germany), "Shift+W declares war on it")
	finish()
