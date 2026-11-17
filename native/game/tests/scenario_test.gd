extends "res://tests/harness.gd"
## Ukraine 2023 starts with Russia and Ukraine at war, and says so before
## you pick a side.


func _initialize() -> void:
	await start("ukraine-2023-v3")
	var russia := country("Russia")
	var ukraine := country("Ukraine")
	check(main.scenario_name == "ukraine-2023-v3", "the Ukraine 2023 package")
	check(main.sim.enemies(ukraine) == PackedInt32Array([russia]), "Ukraine is at war with Russia")
	check(main.sim.enemies(russia) == PackedInt32Array([ukraine]), "and Russia with Ukraine")
	check(main.pick != null and main.sim.is_paused(), "on the pick screen, paused")
	var capital: Vector2 = scenario.country_capital(ukraine)
	main._pick_country(ukraine, main._world_from_lng_lat(capital.x, capital.y))
	var card: Control = main.pick.card
	var labels: Array = card.body.find_children("*", "Label", true, false).map(
		func(l: Label) -> String: return l.text)
	var row := labels.find("At war with")
	check(row >= 0 and labels[row + 1] == "Russia", "the card says Ukraine is at war with Russia: %s" % [labels])
	main._pick_country(country("Poland"), main._world_from_lng_lat(21.0, 52.2))
	labels = card.body.find_children("*", "Label", true, false).map(
		func(l: Label) -> String: return l.text)
	check(not labels.has("At war with"), "Poland's card has no war")

	main.pick.lead_pressed.emit(ukraine)
	await process_frame
	check(main.player == ukraine, "leading Ukraine")
	check(main.top_bar.status.text.begins_with("At war"), "the top bar: %s" % main.top_bar.status.text)
	check(main._own_groups().any(func(g: Dictionary) -> bool: return int(g["enemy"]) == russia),
		"an army group already faces Russia")
	check(not main.event_card.visible, "no card about a war that was there from the start")
	main.sim.toggle_pause()
	main.sim.run(24 * 3)
	main._refresh_sim()
	check(main.sim.enemies(ukraine).has(russia), "the war goes on")
	finish()
