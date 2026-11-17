extends "res://tests/harness.gd"
## The peace conference with two winners: Poland (led) and Russia (AI)
## against Belarus, whose war support runs out. Poland picks first (ties
## go to the lower id), takes Minsk, Russia (holding nothing) leaves, and
## Poland makes Belarus its puppet, which then shows on its card.


func _labels(node: Node) -> Array:
	return node.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)


func _initialize() -> void:
	await start()
	var poland := country("Poland")
	var russia := country("Russia")
	var belarus := country("Belarus")
	check(poland < russia, "Poland has the lower id")
	main._lead(poland, false)
	await process_frame
	main.sim.declare_war(poland, belarus)
	main.sim.declare_war(russia, belarus)
	main._refresh_sim()
	main.sim.set_war_support(belarus, 0)
	main.sim.toggle_pause()
	for hour in 48:
		main.sim.run(1)
		if main.sim.war_record(belarus)["capitulated"]:
			break
	main._refresh_sim()
	check(main.sim.war_record(belarus)["capitulated"], "Belarus gave up")
	check(main.event_card.visible and main.card_report.get("big") == "capitulated", "the victory card first")
	check(main.sim.is_paused(), "paused")
	main._close_card()
	var window: Control = main.conference_window
	check(window.visible and main.conference_loser == belarus, "then the conference")
	var turns: Control = window.dialog.find_child("Turns", true, false)
	check(turns != null and turns.get_child_count() == 2, "two winners in turn")
	var texts := _labels(turns)
	check(texts.has("1  ·  YOUR TURN") and texts.has("Poland (you)") and texts.has("2  ·  WAITING"),
		"Poland first: %s" % [texts])
	check(window.dialog.find_child("Annex", true, false) == null, "no annexing while Russia picks too")

	# Take Minsk: Russia, holding nothing and not the main winner, leaves.
	await look_at(27.56, 53.9, 6.0)
	main._select_at(screen_at(27.56, 53.9), false)
	var minsk: int = main._region_at(main._world_from_lng_lat(27.56, 53.9))
	check(main.conference_selected == minsk, "Minsk chosen")
	(window.dialog.find_child("Take", true, false) as Button).pressed.emit()
	var conference: Dictionary = main.sim.conferences()[0]
	check(PackedInt32Array(conference["done"]) == PackedInt32Array([russia]), "Russia left: %s" % conference)
	check(int(conference["picking"]) == poland, "Poland's turn again")
	check(window.dialog.find_child("Annex", true, false) != null, "now Poland may annex the rest")
	# A click on a region not Belarus's chooses nothing.
	main._select_at(screen_at(21.0, 52.23), false)
	check(main.conference_selected == 0, "Warsaw is not on the table")

	(window.dialog.find_child("Puppet", true, false) as Button).pressed.emit()
	check(not window.visible and main.sim.conferences().is_empty(), "Puppet ends it")
	check(main.sim.overlord(belarus) == poland, "Belarus is Poland's puppet")
	check(main.sim.region_owner(minsk) == poland, "Minsk is Polish")
	var card := _labels(main.event_card.card)
	check(card.has("Belarus is divided") and card.any(func(t: String) -> bool:
		return t.contains("You took Minsk.") and t.contains("Belarus is now your puppet")), "%s" % [card])
	main._close_card()
	check(not main.sim.is_paused(), "the game runs again")
	check(main.markers.arrows_of == {poland: true, belarus: true}, "its arrows show with yours: %s"
		% [main.markers.arrows_of])

	# Its card says so, and offers no war.
	main._show_country_card(belarus, main._world_from_lng_lat(28.5, 53.0))
	var facts := _labels(main.country_card.body)
	check(facts.any(func(t: String) -> bool: return t.begins_with("Your puppet")), "%s" % [facts])
	check(card_buttons(main.country_card).is_empty(), "no Declare war on your own puppet")
	finish()
