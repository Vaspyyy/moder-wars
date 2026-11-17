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
	check(main.army_list.unassigned.visible, "a row for divisions in no group")
	main.army_list.unassigned.pressed.emit()
	check(main.markers.selected.size() == own, "it selects all %d" % own)
	key(KEY_G)
	check(not main.army_list.unassigned.visible, "after G they are all in a group")
	key(KEY_ESCAPE)
	key(KEY_A, false, true)
	check(main.markers.selected.size() == own, "Ctrl+A selects all your divisions")
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
	key(KEY_ESCAPE)
	var one := -1
	for id in main.markers.countries:
		if main.markers.countries[id] == poland:
			one = id
	# A Shift-click takes one division out of its group's selection.
	main._select_at(main.get_canvas_transform() * main.markers.positions[one], true)
	var tip: String = main.command_bar.tip.text
	check(main.command_bar.title.text == "Division %d" % one, "one division: its number")
	check(tip.contains("% strength") and tip.contains("% morale") and tip.contains("holding"),
		"and how it stands: %s" % tip)
	finish()
