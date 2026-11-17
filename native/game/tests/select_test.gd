extends "res://tests/harness.gd"
## Selecting many divisions: the row for divisions in no group, Ctrl+A and
## Shift+drag.


func _button(index: MouseButton, pressed: bool, at: Vector2, shift := false) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = index
	event.pressed = pressed
	event.shift_pressed = shift
	event.position = at
	main._unhandled_input(event)


func _box(from: Vector2, to: Vector2) -> void:
	_button(MOUSE_BUTTON_LEFT, true, from, true)
	_button(MOUSE_BUTTON_LEFT, false, to, true)


func _initialize() -> void:
	await start()
	var poland := country("Poland")
	main._lead(poland, false)
	await look_at(19.0, 52.0, 1.5)
	var own := 0
	for id in main.markers.countries:
		if main.markers.countries[id] == poland:
			own += 1
	check(not main.army_list.unassigned.visible, "every division starts in a group")
	var started: int = main._own_groups().size()
	key(KEY_A, false, true)
	check(main.markers.selected.size() == own, "Ctrl+A selects all your divisions")
	key(KEY_G)
	check(main._own_groups().size() == 1 and main.army_list.rows.get_child_count() == 1,
		"G makes them one group, and the emptied starting groups leave the list")
	var name := "%s Army Group" % main.Style.ordinal(started + 1)
	check(main.command_bar.title.text == name and main.army_list.rows.get_child(0).find_child("Name", true, false).text == name,
		"named after the groups before it: %s" % main.command_bar.title.text)
	key(KEY_ESCAPE)
	# A direct order takes divisions out of their group: the row for
	# divisions in no group selects them.
	var loose := 0
	var data: PackedFloat32Array = main.markers.data
	for i in range(0, data.size(), MwWorld.DIVISION_STRIDE):
		if int(data[i + 1]) == poland and loose < 2:
			# Ordered to stay where it stands, which it always can.
			main.sim.move_divisions(PackedInt64Array([int(data[i])]), data[i + 2], data[i + 3])
			loose += 1
	main._refresh_sim()
	check(main.army_list.unassigned.visible, "a row for divisions in no group")
	main.army_list.unassigned.pressed.emit()
	check(main.markers.selected.size() == 2, "it selects those %d" % main.markers.selected.size())
	key(KEY_G)
	check(not main.army_list.unassigned.visible, "after G they are in a group too")
	key(KEY_ESCAPE)
	_button(MOUSE_BUTTON_LEFT, true, Vector2(2, 2), true)
	var move := InputEventMouseMotion.new()
	move.position = Vector2(1598, 898)
	main._unhandled_input(move)
	check(main.select_box.visible, "Shift+drag shows a box")
	_button(MOUSE_BUTTON_LEFT, false, move.position, true)
	var foreign: Array = main.markers.selected.keys().filter(func(id: int) -> bool:
		return main.markers.countries[id] != poland)
	check(main.markers.selected.size() > 0 and foreign.is_empty(), "the box selects your own divisions only")
	check(not main.select_box.visible, "and goes away")

	# A box over empty sea keeps a selected group.
	key(KEY_ESCAPE)
	main.army_list.show_groups(main._own_groups(), own, 0, 0)
	var group: int = main._own_groups()[0]["id"]
	main._focus_group(group)
	_box(Vector2(4, 4), Vector2(40, 40))
	check(main.markers.selected_group == group, "an empty box keeps the selected group")
	# F during a box: the box ends with its release and the drawing goes on.
	_button(MOUSE_BUTTON_LEFT, true, Vector2(4, 4), true)
	key(KEY_F)
	_button(MOUSE_BUTTON_LEFT, false, Vector2(1500, 800), true)
	check(not main.boxing and not main.select_box.visible, "a box ends even if F was pressed during it")
	check(main.drawing == "front" and main.markers.selected_group == group, "and the drawing keeps its group")
	key(KEY_ESCAPE)

	# A pan whose button is let go during a box ends.
	_button(MOUSE_BUTTON_RIGHT, true, Vector2(700, 400))
	_button(MOUSE_BUTTON_LEFT, true, Vector2(4, 4), true)
	_button(MOUSE_BUTTON_RIGHT, false, Vector2(700, 400))
	_button(MOUSE_BUTTON_LEFT, false, Vector2(300, 300), true)
	check(not main.dragging, "a pan let go during a box ends")
	# Esc drops a box; letting go of it after Shift (on the spot of the last
	# plain click, empty sea) is no click that clears the selection.
	_button(MOUSE_BUTTON_LEFT, true, Vector2(8, 8))
	_button(MOUSE_BUTTON_LEFT, false, Vector2(8, 8))
	main._focus_group(group)
	_button(MOUSE_BUTTON_LEFT, true, Vector2(8, 8), true)
	var motion := InputEventMouseMotion.new()
	motion.position = Vector2(200, 200)
	main._unhandled_input(motion)
	key(KEY_ESCAPE)
	main._unhandled_input(motion)
	check(not main.select_box.visible, "Esc drops a box")
	_button(MOUSE_BUTTON_LEFT, false, Vector2(8, 8))
	check(main.markers.selected_group == group and not main.boxing, "and letting go of it selects nothing")
	key(KEY_ESCAPE)
	check(main.markers.selected_group == 0 and not main.menu.visible,
		"Esc clears the selection before it opens the pause menu")
	var one := -1
	for id in main.markers.countries:
		if main.markers.countries[id] == poland:
			one = id
	# A group of two; a Shift-click takes one out, and the other is selected
	# on its own: the command bar tells how it stands.
	var two := -1
	for id in main.markers.countries:
		if main.markers.countries[id] == poland and id != one and two < 0:
			two = id
	main._select_at(main.get_canvas_transform() * main.markers.positions[one], true)
	main._select_at(main.get_canvas_transform() * main.markers.positions[two], true)
	key(KEY_G)
	check(main.markers.selected_group != 0 and main.markers.selected.size() == 2, "a group of two")
	check(not main.command_bar.tip.text.contains("% strength"), "a group shows no division's state")
	main._select_at(main.get_canvas_transform() * main.markers.positions[one], true)
	check(main.markers.selected.keys() == [two] and main.markers.selected_group == 0,
		"a Shift-click takes one out of the group's selection")
	var at := -1
	for i in range(0, main.markers.data.size(), MwWorld.DIVISION_STRIDE):
		if int(main.markers.data[i]) == two:
			at = i
	var stands := "%d%% strength  ·  %d%% morale  ·  " % [
		roundi(main.markers.data[at + 4] * 100.0), roundi(main.markers.data[at + 5] * 100.0)]
	var tip: String = main.command_bar.tip.text
	check(main.command_bar.title.text == "Division %d" % two, "the other: its number")
	check(tip.begins_with(stands) and tip.ends_with("right-click to move it"), "and how it stands: %s" % tip)
	# A division that is gone leaves the selection.
	main.markers.selected[987654] = true
	main._refresh_sim()
	check(not main.markers.selected.has(987654), "a division that is gone leaves the selection")
	finish()
