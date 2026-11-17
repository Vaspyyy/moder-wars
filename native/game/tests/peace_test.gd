extends "res://tests/harness.gd"
## Peace talks and terms: clicking regions on the map adds them to the
## terms or drops them, the meter says how likely the enemy is to accept,
## Send terms sends exactly those, a refusal keeps talks closed for a week,
## White peace asks for nothing, and an enemy's terms can be refused.


func _labels(node: Node) -> Array:
	return node.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)


func _region(lng: float, lat: float) -> int:
	return main._region_at(main._world_from_lng_lat(lng, lat))


func _initialize() -> void:
	await start()
	var poland := country("Poland")
	var belarus := country("Belarus")
	var germany := country("Germany")
	main._lead(poland, false)
	await process_frame
	main.sim.declare_war(poland, belarus)
	main._refresh_sim()
	await look_at(24.0, 53.0, 3.0)

	# The talks open from the enemy's card, on the terms the land held gives:
	# nothing is held yet, so a white peace.
	main._open_peace(belarus, false)
	var window: Control = main.peace_window
	check(window.visible and not window.incoming, "Offer peace opens the talks")
	check(main.peace_terms.is_empty(), "nothing held: no region in the terms")
	check(window.mouse_filter == Control.MOUSE_FILTER_IGNORE, "the map behind takes clicks")
	check(_labels(window.dialog).has("Your terms for Belarus"), "titled with the enemy")

	# A click on Minsk asks for it; a click on Warsaw gives Masovia up.
	var minsk := _region(27.56, 53.9)
	var masovia := _region(21.0, 52.23)
	check(main.sim.region_owner(minsk) == belarus and main.sim.region_owner(masovia) == poland,
		"Minsk is Belarus's, Masovia Poland's")
	main._select_at(screen_at(27.56, 53.9), false)
	check(main.peace_terms == PackedInt32Array([minsk]), "a click on Minsk adds it: %s" % [main.peace_terms])
	var row: Control = window.dialog.find_child("Term%d" % minsk, true, false)
	check(row != null and _labels(row).has("Not yours yet"), "Minsk is not held: %s" % [_labels(row) if row else []])
	var talks: Dictionary = main.sim.peace_talks(poland, belarus, main.peace_terms)
	var verdict: Label = window.dialog.find_child("Verdict", true, false)
	check(verdict.text == window.verdict(float(talks["chance"])), "the meter says %s" % verdict.text)
	check(float(talks["chance"]) < 0.05 and verdict.text == "Will refuse",
		"asking for unheld Minsk at the start of the war: %s" % talks)
	main._select_at(screen_at(21.0, 52.23), false)
	check(main.peace_terms.has(masovia), "a click on Warsaw adds Masovia")
	row = window.dialog.find_child("Term%d" % masovia, true, false)
	check(row != null and _labels(row).has("You give it up"), "as given up")
	# Its ✕ drops it again; a click elsewhere (Germany) changes nothing.
	(row.find_child("Drop", true, false) as Button).pressed.emit()
	check(main.peace_terms == PackedInt32Array([minsk]), "✕ drops Masovia")
	main._select_at(screen_at(13.4, 52.5), false)
	check(main.peace_terms == PackedInt32Array([minsk]), "Berlin is not part of these talks")
	check(main.sim.is_paused(), "paused while talking")

	# Send terms: Belarus gets exactly them, and refuses within a day.
	key(KEY_ENTER)
	check(not window.visible, "Send terms closes the talks")
	var offers: Array = main.sim.peace_offers()
	check(offers.size() == 1 and PackedInt32Array(offers[0]["terms"]) == PackedInt32Array([minsk]),
		"the offer carries Minsk: %s" % [offers])
	main.sim.toggle_pause()
	main.sim.run(30)
	main._refresh_sim()
	check(main.sim.enemies(poland).has(belarus), "Belarus refused: the war goes on")
	check(main.reports.entries.any(func(e: Array) -> bool: return e[0] == "Belarus refused peace with Poland"),
		"the reports say so")

	# Talks are closed for a week: Send and White peace wait.
	main._open_peace(belarus, false)
	var send: Button = window.dialog.find_child("Send", true, false)
	check(send.disabled, "Send waits while Belarus will not talk")
	check(_labels(window.dialog).any(func(t: String) -> bool: return t.contains("talks again in")),
		"and says when it talks again")
	key(KEY_ESCAPE)
	check(not window.visible and main.sim.peace_offers().is_empty(), "Esc cancels")

	# An enemy's terms: Germany wants Masovia. Refuse keeps the war going.
	main.sim.declare_war(germany, poland)
	main._refresh_sim()
	main._close_card()
	check(main.sim.offer_peace_to(germany, poland, PackedInt32Array([masovia])), "Germany sends terms")
	main._refresh_sim()
	check(window.visible and window.incoming, "they open the window")
	check(window.mouse_filter == Control.MOUSE_FILTER_STOP, "which keeps the map's clicks")
	var texts := _labels(window.dialog)
	check(texts.has("Germany offers peace, for one region"), "the title: %s" % [texts])
	check(texts.any(func(t: String) -> bool: return t.contains("Masovian Voivodeship becomes Germany's")),
		"and what it takes")
	var table: Control = window.dialog.find_child("Table", true, false)
	check(_labels(table).any(func(t: String) -> bool: return t.ends_with("% of your output")),
		"what the terms take, in output")
	(window.dialog.find_child("Refuse", true, false) as Control).pressed.emit()
	check(not window.visible and main.sim.enemies(poland).has(germany), "Refuse: the war goes on")

	# White peace from the talks asks for nothing.
	main._open_peace(germany, false)
	(window.dialog.find_child("White", true, false) as Control).pressed.emit()
	offers = main.sim.peace_offers().filter(func(o: Dictionary) -> bool: return int(o["to"]) == germany)
	check(offers.size() == 1 and PackedInt32Array(offers[0]["terms"]).is_empty(), "a white peace offer")
	finish()
