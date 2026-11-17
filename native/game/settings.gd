extends RefCounted
## Game setup kept from one game to the next (in `path`): whether a new game
## starts with the real alliances of its date (NATO and the CSTO).

## Tests point it elsewhere.
static var path := "user://settings.cfg"


static func real_alliances() -> bool:
	var config := ConfigFile.new()
	if config.load(path) != OK:
		return true
	return bool(config.get_value("setup", "real_alliances", true))


static func set_real_alliances(on: bool) -> void:
	var config := ConfigFile.new()
	config.load(path)
	config.set_value("setup", "real_alliances", on)
	config.save(path)
