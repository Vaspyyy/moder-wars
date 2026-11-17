extends "res://tests/harness.gd"
## The budget and mobilization window.


func _initialize() -> void:
	await start()
	var germany := country("Germany")
	main._lead(germany, false)
	await process_frame
	key(KEY_B)
	check(main.economy_window.visible, "B opens the economy window")
	main.economy_window.equipment.value = 15
	main.economy_window.recruiting.value = 90
	var e: Dictionary = main.sim.economy(germany)
	check(int(e["recruiting"]) == 90 and int(e["equipment"]) == 10, "recruiting at 90% leaves 10% for equipment")
	check(int(e["home_front"]) == 0, "and nothing for the home front")
	check(int(main.economy_window.equipment.value) == 10, "the equipment slider moved down")
	check(main.economy_window.notes["Recruiting"].text.ends_with("the most allowed"), "it says what recruiting buys")
	main.economy_window.level_buttons[2].pressed.emit()
	check(int(main.sim.economy(germany)["mobilization"]) == 2, "General mobilization")
	check(main.economy_window.level_buttons[2].chosen, "shown as chosen")
	key(KEY_ESCAPE)
	check(not main.economy_window.visible, "Esc closes it")
	main.top_bar.economy_pressed.emit()
	check(main.economy_window.visible, "income in the top bar opens it")
	finish()
