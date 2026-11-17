extends "res://tests/harness.gd"
## The war screen: big events pause the game on a card, the army group
## list selects groups, a country's card declares war and opens the peace
## window.


func _initialize() -> void:
	await start()
	var poland := country("Poland")
	var germany := country("Germany")
	var france := country("France")
	main._lead(poland, false)
	await process_frame
	main.sim.toggle_pause() # running

	main.sim.declare_war(germany, poland)
	main._refresh_sim()
	check(main.event_card.visible and main.card_report.get("big") == "war", "a war on the player opens a card")
	check(main.sim.is_paused(), "and pauses the game")
	check(main.reports.entries[-1][0] == "Germany declared war on Poland", "the report is in the feed")
	check(not _said("No army group holds your border with Germany"), "Poland's starting group holds it")
	check(_card_text().contains("Give your army groups fronts along it"), "the card says what to do")
	main._close_card()
	check(not main.event_card.visible and not main.sim.is_paused(), "closing it lets the game run again")

	main.sim.offer_peace(germany)
	main._refresh_sim()
	check(main.peace_window.visible and main.peace_window.incoming, "a peace offer opens the peace window")
	key(KEY_Y)
	check(main.sim.enemies(poland).is_empty(), "Y accepts: the war is over")
	check(main.card_report.get("big") == "peace", "then the peace card")
	main._close_card()
	check(not main.sim.is_paused(), "running after the last card")

	# Poland starts with a group for each border its divisions man.
	var groups: Array = main._own_groups()
	check(groups.size() >= 2 and main.army_list.rows.get_child_count() == groups.size(),
		"a row for each starting group: %d" % groups.size())
	check(groups.all(func(g: Dictionary) -> bool: return PackedVector2Array(g["front"]).size() > 0),
		"each with a front")
	check(not main.army_list.unassigned.visible, "and no division without a group")
	var group: int = groups[0]["id"]
	main._focus_group(group)
	check(main.markers.selected_group == group and main.command_bar.visible, "a click on the row selects the group")
	check(main.command_bar.title.text == "1st Army Group", "named 1st Army Group")

	await look_at(2.35, 48.86, 2.0)
	main._select_at(screen_at(2.35, 48.86), false)
	check(main.country_card.card.visible and main.country_card.country == france, "a click on Paris shows France's card")
	var buttons := card_buttons(main.country_card)
	check(buttons.size() > 0 and buttons[0].text == "Declare war", "with Declare war")
	buttons[0].pressed.emit()
	check(main.sim.enemies(poland).has(france), "which declares war")
	check(not main.country_card.card.visible, "and closes the card")
	main._select_at(screen_at(2.35, 48.86), false)
	buttons = card_buttons(main.country_card)
	check(buttons.size() > 0 and buttons[0].text == "Offer peace", "at war, the card offers peace")

	# The card follows the war: Spain's card at peace, then Spain declares war.
	var spain := country("Spain")
	main._show_country_card(spain, main._world_from_lng_lat(-3.7, 40.4))
	check(card_buttons(main.country_card)[0].text == "Declare war", "Spain's card offers war")
	main.sim.declare_war(spain, poland)
	main._refresh_sim()
	main._close_card()
	check(card_buttons(main.country_card)[0].text == "Offer peace", "once Spain declares war, the card offers peace")
	main._show_country_card(france, main._world_from_lng_lat(2.35, 48.86))
	buttons = card_buttons(main.country_card)
	check(buttons[0].text == "Offer peace", "France's card offers peace again")
	var running: bool = not main.sim.is_paused()
	buttons[0].pressed.emit()
	check(main.peace_window.visible and not main.peace_window.incoming, "Offer peace opens the peace window to send one")
	check(main.sim.is_paused(), "paused while it is open")
	key(KEY_ESCAPE)
	check(not main.peace_window.visible and main.sim.is_paused() != running, "Esc cancels and the game runs as before")
	check(main.sim.enemies(poland).has(france), "nothing was sent")
	main._open_peace(france, false)
	main._answer_peace(true)
	var offered: bool = main.sim.peace_offers().any(func(o: Dictionary) -> bool:
		return int(o["from"]) == poland and int(o["to"]) == france)
	check(offered, "Offer peace sends the offer")

	# A war on a border no army group holds says so: in the reports for a
	# war the player starts, and on the card for one declared on it.
	var belarus := country("Belarus")
	main.sim.declare_war(poland, belarus)
	main._refresh_sim()
	check(_said("No army group holds your border with Belarus: select one and draw its front along it (F)"),
		"a war on an unguarded border says so")
	var lithuania := country("Lithuania")
	main.sim.declare_war(lithuania, poland)
	main._refresh_sim()
	check(main.event_card.visible and _card_text().contains("none of your army groups holds it yet"),
		"the war card says the border is unguarded: %s" % _card_text())
	check(_said("No army group holds your border with Lithuania: select one and draw its front along it (F)"),
		"and so do the reports")
	main._close_card()
	# Not again for a war that goes on, nor for a far-away enemy.
	main.sim.declare_war(poland, country("Japan"))
	main._refresh_sim()
	main.sim.run(2)
	main._refresh_sim()
	check(not _said("No army group holds your border with Japan"), "no land border, no hint")
	check(main.reports.entries.filter(func(e: Array) -> bool:
		return String(e[0]).begins_with("No army group holds your border with Belarus")).size() == 1,
		"said once per war")

	# A victory names what the player gains: as Germany, one division takes
	# Luxembourg's capital.
	main.free()
	await start()
	var germany_led := country("Germany")
	var luxembourg := country("Luxembourg")
	main._lead(germany_led, false)
	main.sim.declare_war(germany_led, luxembourg)
	main._refresh_sim()
	var target: Vector2 = main._world_from_lng_lat(6.13, 49.61)
	var nearest := -1
	for id in main.markers.countries:
		if main.markers.countries[id] == germany_led and (nearest < 0
				or main.markers.positions[id].distance_to(target) < main.markers.positions[nearest].distance_to(target)):
			nearest = id
	main.sim.move_divisions(PackedInt64Array([nearest]), 6.13, 49.61)
	for day in 30:
		main.sim.run(24)
		if main.sim.war_record(luxembourg)["capitulated"]:
			break
	main._refresh_sim()
	check(not main.peace_window.visible, "no window for the peace offer the capitulation ended")
	check(main.event_card.visible and _card_text().contains("Luxembourg capitulated"), "a victory card")
	check(_card_text().contains("Next, at the peace conference, you decide what becomes of its land."),
		"announcing the conference: %s" % _card_text())

	# The conference: Germany won alone. A click picks a region, Take takes
	# it, Annex the rest takes the others.
	main._close_card()
	var window: Control = main.conference_window
	check(window.visible and main.conference_loser == luxembourg, "then the peace conference")
	check(main.sim.is_paused(), "paused while dividing")
	var labels := func() -> Array: return window.dialog.find_children("*", "Label", true, false).map(
		func(l: Label) -> String: return l.text)
	check(labels.call().has("Divide Luxembourg"), "titled for the loser")
	check(window.dialog.find_child("Turns", true, false) == null, "no turns for a lone winner")
	check((window.dialog.find_child("Take", true, false) as Button).disabled, "Take waits for a region")
	await look_at(6.13, 49.61, 8.0)
	main._select_at(screen_at(6.13, 49.61), false)
	var capital_region: int = main._region_at(main._world_from_lng_lat(6.13, 49.61))
	check(main.conference_selected == capital_region, "a click on the capital chooses its region")
	var take: Button = window.dialog.find_child("Take", true, false)
	check(not take.disabled and take.text == "Take " + scenario.region_name(capital_region), take.text)
	take.pressed.emit()
	check(labels.call().has("You took " + scenario.region_name(capital_region)), "listed as taken")
	check(main.sim.conferences().size() == 1, "the rest is still open")
	(window.dialog.find_child("Annex", true, false) as Button).pressed.emit()
	check(not window.visible and main.sim.conferences().is_empty(), "Annex the rest ends it")
	check(main.event_card.visible and _card_text().contains("Luxembourg is divided")
		and _card_text().contains("Luxembourg is gone from the map."), "a last card: %s" % _card_text())
	check(main.sim.region_owner(capital_region) == germany_led, "the capital's region is German")
	main._close_card()
	check(not main.event_card.visible, "and the game goes on")
	finish()


func _said(prefix: String) -> bool:
	return main.reports.entries.any(func(e: Array) -> bool: return String(e[0]).begins_with(prefix))


func _card_text() -> String:
	var texts := PackedStringArray()
	for label in main.event_card.card.find_children("*", "Label", true, false):
		texts.append(label.text)
	return " ".join(texts)
