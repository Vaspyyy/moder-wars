extends "res://tests/harness.gd"
## Factions on screen: the Play screen's real alliances switch; NATO in the
## top bar and its window (members, map stripes); allies' and enemies'
## cards; the card when NATO defends a member; a call to arms answered with
## Y; the separate-peace warning; an invitation and a request to join
## answered on cards; forming and naming a faction from a country's card.

var restarts: Array = []


func _labels(node: Node) -> Array:
	return node.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)


func _card_of(name: String) -> void:
	main._show_country_card(country(name), Vector2.ZERO)


func _relation() -> String:
	var facts: Array = _labels(main.country_card.body)
	var at := facts.find("Relation")
	return facts[at + 1] if at >= 0 else ""


func _aside() -> String:
	var aside: Label = main.country_card.body.find_child("Aside", false, false)
	return aside.text if aside != null else ""


## Each button's caption (a tool button keeps it in a label).
func _texts(buttons: Array) -> Array:
	return buttons.map(func(b: Control) -> String:
		if b is Button and (b as Button).text != "":
			return (b as Button).text
		var labels := b.find_children("*", "Label", true, false)
		return (labels[0] as Label).text if not labels.is_empty() else "")


func _marks_on() -> bool:
	return (main.map_rect.material as ShaderMaterial).get_shader_parameter("has_marks")


func _initialize() -> void:
	# The Play screen: real alliances is a game setup switch, kept for the
	# next game, and another setup starts the scene again.
	await start("", {"alliances": "on"})
	main.restart = func() -> void: restarts.append(main.restart_args.duplicate())
	main.main_menu.show_play()
	var switch: Button = main.main_menu.content.find_child("Alliances", true, false)
	check(switch != null and switch.button_pressed, "real alliances on")
	switch.button_pressed = false
	check(not main.main_menu.alliances, "switched off")
	(main.main_menu.content.find_child("Start", true, false) as Button).pressed.emit()
	check(restarts == [{"scenario": "world-map-2026-v3", "pick": "", "alliances": "off"}],
		"another setup starts the scene again: %s" % [restarts])
	check(not Settings.real_alliances(), "and the choice is kept")

	# Leading Poland in NATO: the top bar names it, its window lists it.
	main.free()
	await start("", {"pick": "", "alliances": "on"})
	var poland := country("Poland")
	var germany := country("Germany")
	main._lead(poland, false)
	main._refresh_sim()
	var chip: Button = main.top_bar.faction
	check(chip.visible and chip.text == "NATO", "NATO in the top bar: %s" % chip.text)
	check(main.markers.arrows_of.has(germany), "allies' arrows show with yours")
	chip.pressed.emit()
	var window: Control = main.faction_window
	check(window.visible and _labels(window.dialog).has("NATO"), "its window")
	var members: Control = window.dialog.find_child("Members", true, false)
	check(members != null and members.get_child_count() == 32, "32 members")
	var first: Control = members.get_child(0) if members != null else null
	check(first != null and _labels(first).has("United States of America") and _labels(first).has("Leader"),
		"the strongest first, the leader tagged")
	check(window.dialog.find_child("Name", true, false) == null, "only the leader renames it")
	check(_marks_on(), "factions striped on the map")
	key(KEY_ESCAPE)
	check(not window.visible and not _marks_on(), "Esc closes it and the stripes")

	# Cards: an ally, and a CSTO member with who defends it.
	await look_at(15.0, 52.0, 3.0)
	_card_of("Germany")
	check(_relation().begins_with("Your ally  ·  NATO"), _relation())
	check(card_buttons(main.country_card).is_empty(), "no war on an ally")
	_card_of("Belarus")
	check(_relation() == "At peace with you  ·  in CSTO", _relation())
	check(_aside().begins_with("CSTO defends it: you would be at war with ") and _aside().contains("Russia"),
		_aside())
	check(_texts(card_buttons(main.country_card)) == ["Declare war"], "no faction button for a member")
	main._show_country_card(0, Vector2.ZERO)

	# Russia attacks Estonia: NATO defends it, Poland too.
	var russia := country("Russia")
	var estonia := country("Estonia")
	main.sim.declare_war(russia, estonia)
	main._refresh_sim()
	check(main.event_card.visible and main.card_report.get("big") == "defend", "the defend card")
	var texts := _labels(main.event_card.card)
	check(texts.has("Russia attacked Estonia") and texts.any(func(t: String) -> bool:
		return t.begins_with("WAR  ·  NATO DEFENDS ESTONIA")), "%s" % [texts])
	check(main.sim.enemies(poland).has(russia), "Poland is at war with Russia")
	check(not main.cards.any(func(c: Dictionary) -> bool: return c["big"] == "war"),
		"and no second card for the same war")
	main._close_card()

	# A fresh game: Lithuania attacks Belarus and calls NATO to arms.
	main.free()
	await start("", {"pick": "", "alliances": "on"})
	main._lead(poland, false)
	var lithuania := country("Lithuania")
	var belarus := country("Belarus")
	main.sim.declare_war(lithuania, belarus)
	main._refresh_sim()
	check(main.event_card.visible and main.event_card.choice and main.card_report.get("big") == "call_to_arms",
		"a call to arms: %s" % [main.card_report])
	texts = _labels(main.event_card.card)
	check(texts.has("Lithuania attacks Belarus"), "%s" % [texts])
	# Saved and loaded now, the call is asked again.
	var dir := (OS.get_environment("TMPDIR") if OS.has_environment("TMPDIR") else "/tmp") \
		.path_join("mw-faction-test-%d" % OS.get_process_id())
	DirAccess.make_dir_recursive_absolute(dir)
	main.save_dir = dir
	main._quicksave()
	check(main._quickload(), "the quick save loads")
	main._refresh_sim()
	check(main.event_card.visible and main.card_report.get("big") == "call_to_arms"
		and int(main.card_report.get("also", 0)) == belarus, "the call again after a load")
	for file in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir.path_join(file))
	DirAccess.remove_absolute(dir)
	key(KEY_Y)
	check(not main.event_card.visible and main.sim.enemies(poland).has(belarus), "Y joins the war")
	check(main.sim.enemies(poland).has(russia), "and the CSTO defends Belarus")
	# Peace on its own would take Poland out of NATO.
	main._open_peace(belarus, false)
	var leaving: Control = main.peace_window.dialog.find_child("Leaving", true, false)
	check(leaving != null and _labels(leaving).has("You would leave NATO"), "the separate-peace warning")
	var send: Button = main.peace_window.dialog.find_child("Send", true, false)
	check(send != null and send.text == "Send terms, leave NATO", send.text if send else "no Send")
	key(KEY_ESCAPE)
	check(not main.peace_window.visible, "Esc cancels")

	# Without real alliances: leading Ukraine, Moldova invites it.
	main.free()
	await start()
	var ukraine := country("Ukraine")
	var moldova := country("Moldova")
	main._lead(ukraine, false)
	main._refresh_sim()
	check(not main.top_bar.faction.visible, "no faction, no button")
	main.sim.invite_to_faction(moldova, ukraine, "")
	main._refresh_sim()
	check(main.event_card.visible and main.event_card.choice
		and _labels(main.event_card.card).has("Moldova asks you to form a faction"), "the invitation card")
	key(KEY_N)
	check(main.sim.faction_of(ukraine) == 0, "N refuses")

	# Ukraine forms a faction with Moldova from its card.
	main.sim.set_ai(moldova, true)
	_card_of("Moldova")
	var buttons := card_buttons(main.country_card)
	check(_texts(buttons) == ["Declare war", "Form a faction"], "%s" % [_texts(buttons)])
	check(_aside().contains("It would likely say yes: ") and _aside().contains("threatens it"), _aside())
	buttons[1].pressed.emit()
	check(main.sim.invites().size() == 1 and not main.country_card.card.visible, "the invitation is sent")
	main.sim.toggle_pause()
	for hour in 24:
		main.sim.run(1)
	main.sim.toggle_pause()
	main._refresh_sim()
	check(main.sim.faction_of(ukraine) != 0 and main.sim.allied(ukraine, moldova), "Moldova said yes")
	check(main.event_card.visible and main.card_report.get("big") == "joined", "a card says so")
	main._close_card()
	check(main.top_bar.faction.text == "Ukraine's faction", main.top_bar.faction.text)
	main._open_faction(true)
	var name_box: LineEdit = main.faction_window.dialog.find_child("Name", true, false)
	check(name_box != null, "the leader names it")
	if name_box != null:
		name_box.text_submitted.emit("Black Sea Pact")
	check(main.top_bar.faction.text == "Black Sea Pact", main.top_bar.faction.text)
	var leave: Control = main.faction_window.dialog.find_child("Leave", true, false)
	leave.pressed.emit()
	check(main.sim.allied(ukraine, moldova), "Leave asks once first")
	main._open_faction(false)

	# Slovakia asks to join; Ukraine says no.
	var slovakia := country("Slovakia")
	main.sim.ask_to_join(slovakia, main.sim.faction_of(ukraine))
	main._refresh_sim()
	check(main.event_card.visible and _labels(main.event_card.card).has("Slovakia asks to join Black Sea Pact"),
		"the request card")
	key(KEY_N)
	check(not main.sim.allied(ukraine, slovakia), "N keeps it out")
	finish()
