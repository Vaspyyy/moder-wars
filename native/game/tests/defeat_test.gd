extends "res://tests/harness.gd"
## The defeat screen: when the country you lead capitulates, the game
## pauses on what the war cost, and Main menu, Load your save and Watch the
## world go on each do what they say.

var dir := ""
var restarts := 0


## Lead Luxembourg (no army of its own) into a war with Germany, run by
## the AI, until it capitulates. Returns whether it did.
func _lose() -> bool:
	if main != null:
		main.free()
	await start()
	main.save_dir = dir
	main.restart = func() -> void: restarts += 1
	var luxembourg := country("Luxembourg")
	main._lead(luxembourg, false)
	main.sim.declare_war(country("Germany"), luxembourg)
	main._refresh_sim()
	main._close_card() # "Germany declared war on Luxembourg"
	for day in 30:
		main.sim.run(24)
		if main.sim.war_record(luxembourg)["capitulated"]:
			return true
	return false


func _value(row: int) -> String:
	var table: Control = main.defeat_screen.inner.find_child("Table", true, false)
	return (table.get_child(row).find_child("Value", true, false) as Label).text


func _press(name: String) -> void:
	var button: Button = main.defeat_screen.inner.find_child(name, true, false)
	check(button != null, "a button %s" % name)
	if button != null:
		button.pressed.emit()


func _initialize() -> void:
	dir = OS.get_environment("TMPDIR") if OS.has_environment("TMPDIR") else "/tmp"
	dir = dir.path_join("mw-defeat-test-%d" % OS.get_process_id())
	DirAccess.make_dir_recursive_absolute(dir)

	check(await _lose(), "Luxembourg capitulates within a month")
	var luxembourg := country("Luxembourg")
	var germany := country("Germany")
	main.sim.toggle_pause() # running, as a player would be
	main._refresh_sim()
	var screen: Control = main.defeat_screen
	check(screen.visible and not main.event_card.visible, "the defeat screen, not a card")
	check(main.sim.is_paused(), "and the game waits")
	var title: Label = screen.inner.find_child("Title", true, false)
	check(title.text == "Luxembourg capitulated", title.text)
	var record: Dictionary = main.sim.war_record(luxembourg)
	check(PackedInt32Array(record["enemies"]) == PackedInt32Array([germany]), "it gave up to Germany")
	check(_value(0) == ("%d days" % int(record["war_days"])) and int(record["war_days"]) >= 1,
		"days at war: %s" % _value(0))
	check(_value(1) == "0", "no divisions raised")
	check(_value(4) == "%d%%" % roundi(float(record["land_kept"]) * 100.0), "land kept: %s" % _value(4))
	check(float(record["land_kept"]) < 1.0, "Germany took some of it")
	var story: Label = screen.inner.find_child("Story", true, false)
	check(story.text.begins_with("Luxembourg fell and most of the country with it."), story.text)
	check(story.text.contains("at the peace conference Germany took the regions below."), story.text)
	check(main.sim.overlord(luxembourg) == germany and story.text.ends_with(
		"Germany made you its puppet: you keep the rest, but fight in its wars and pay it a quarter of your income."),
		"the AI made Luxembourg its puppet: %s" % story.text)
	var ceded: Control = screen.inner.find_child("Ceded", true, false)
	check(ceded != null and ceded.find_children("*", "Label", true, false).any(
		func(l: Label) -> bool: return l.text.begins_with("Ceded to Germany: ")), "the regions Germany got")
	# Nothing reaches the game behind it.
	key(KEY_SPACE)
	key(KEY_B)
	check(main.sim.is_paused() and not main.economy_window.visible, "keys wait")

	# Only your own arrows are on the map while you lead a country.
	var line := PackedVector2Array([Vector2.ZERO, Vector2.ONE])
	var german_attack := {"arrow": line, "country": germany}
	check(main.markers.arrows_of == {luxembourg: true}, "your arrows only: %s" % [main.markers.arrows_of])
	check(not main.markers.shows_arrow(german_attack), "a German arrow is not shown")
	check(main.markers.shows_arrow({"arrow": line, "country": luxembourg}), "yours is")
	check(not main.markers.shows_arrow({"arrow": PackedVector2Array(), "country": luxembourg}),
		"a group without an arrow draws none")

	# Watch the world go on: the screen closes and the game runs again.
	_press("Watch")
	check(not screen.visible and not main.sim.is_paused(), "Watch lets the world go on")
	check(main.markers.shows_arrow(german_attack), "watching, every country's arrows show")
	main.sim.run(24)
	main._refresh_sim()
	check(not screen.visible, "and it does not come back")

	# Load your save: the saves of this game, with the game still paused.
	check(await _lose(), "a second defeat")
	main.sim.toggle_pause()
	main._refresh_sim()
	check(main.defeat_screen.visible, "the screen again")
	_press("Load")
	check(not main.defeat_screen.visible and main.menu.visible and main.menu.view == "saves",
		"Load your save opens the saves")
	check(main.sim.is_paused(), "still paused")
	check(main.paused_by_menu and not main.paused_by_card, "the menu now holds the pause")
	key(KEY_ESCAPE)
	key(KEY_ESCAPE)
	check(not main.menu.visible and not main.sim.is_paused(),
		"backing out of the menu lets the game run as it did before the defeat")

	# Esc watches too, and Main menu starts over right away.
	check(await _lose(), "a third defeat")
	main._refresh_sim()
	key(KEY_ESCAPE)
	check(not main.defeat_screen.visible, "Esc closes it")
	check(main.watching and main.markers.arrows_of.is_empty(), "and watches")
	# A save loaded from the menu that closing the window opens over the
	# screen takes the screen away too.
	main._quicksave()
	main.sim.run(1)
	main.cards.append({"big": "capitulated", "other": luxembourg})
	main._refresh_sim()
	check(main.defeat_screen.visible, "the screen once more")
	main._notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
	check(main.menu.visible and main.menu.view == "leave", "closing the window asks over it")
	key(KEY_F9)
	check(not main.defeat_screen.visible and not main.menu.visible, "a load closes both")
	main._refresh_sim()
	check(not main.watching and main.markers.arrows_of == {luxembourg: true},
		"the loaded game is yours to lead again: your arrows only")
	main.cards.append({"big": "capitulated", "other": luxembourg})
	main._refresh_sim()
	check(main.defeat_screen.visible, "the screen again")
	key(KEY_F9)
	check(not main.defeat_screen.visible and main.sim.is_paused(), "F9 on the screen loads, paused")
	check(await _lose(), "a fourth defeat")
	main._refresh_sim()
	_press("NewGame")
	check(restarts == 1, "Main menu starts over, without asking")

	for file in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir.path_join(file))
	DirAccess.remove_absolute(dir)
	finish()
