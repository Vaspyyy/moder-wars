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
	finish()
