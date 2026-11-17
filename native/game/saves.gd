extends RefCounted
## The save files of one scenario and one led country (or the viewer):
## the quick save (F5 and F9) and any number of named saves. Each save is a
## `.mwsave` file with a small `.json` file beside it that holds its name,
## the time in the game and when it was saved, so the list shows without
## loading every save. Saves made leading one country never list while
## leading another (loading one would hand your country to the AI).

const INFO := ".json"

## The folder the saves are in (Godot's user folder, tests use their own).
var dir := "user://"
## The scenario package ("world-map-2026-v3").
var scenario_name := ""
## Whose saves: "viewer", or "<id>-<name>" of the led country (the id tells
## apart countries of one name).
var who := "viewer"


func quick_path() -> String:
	return _path("quicksave-%s-%s.mwsave" % [scenario_name, who])


## The quick save's entry (see `list`), or an empty dictionary if there is
## none.
func quick() -> Dictionary:
	var path := quick_path()
	return _entry(path, "Quick save") if FileAccess.file_exists(path) else {}


## The named saves, newest first: dictionaries with `path`, `name`, `time`
## (in the game, "2026-10-25 09:00", empty if unknown) and `saved` (Unix
## seconds).
func list() -> Array:
	var prefix := _file("save-%s-%s-" % [scenario_name, who])
	var found: Array = []
	for file in DirAccess.get_files_at(ProjectSettings.globalize_path(dir)):
		if file.begins_with(prefix) and file.ends_with(".mwsave"):
			found.append(_entry(_path(file), "Save"))
	found.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a["saved"] > b["saved"] if a["saved"] != b["saved"] else a["path"] > b["path"])
	return found


## The quick save, if any, then the named saves.
func count() -> int:
	return list().size() + (0 if quick().is_empty() else 1)


## Save the game as a new named save. Returns an empty string or the error.
func create(sim: MwWorld, name: String) -> String:
	var stamp := int(Time.get_unix_time_from_system() * 1000.0)
	var path := _path("save-%s-%s-%d.mwsave" % [scenario_name, who, stamp])
	while FileAccess.file_exists(path):
		stamp += 1
		path = _path("save-%s-%s-%d.mwsave" % [scenario_name, who, stamp])
	return write(sim, path, name)


## Save the game into `path` (a new save, an overwrite or the quick save)
## under `name`. Returns an empty string or the error.
func write(sim: MwWorld, path: String, name: String) -> String:
	var error := sim.save_game(path)
	if error != "":
		return error
	var info := FileAccess.open(path.get_basename() + INFO, FileAccess.WRITE)
	if info == null:
		return "Cannot save the name of %s: %s" % [path, error_string(FileAccess.get_open_error())]
	info.store_string(JSON.stringify({"name": name, "time": sim.time_text(),
		"saved": Time.get_unix_time_from_system()}))
	return ""


## Delete a save and its name file. Returns an empty string or the error.
func delete(path: String) -> String:
	var error := DirAccess.remove_absolute(path)
	if error != OK:
		return "Cannot delete %s: %s" % [path, error_string(error)]
	if FileAccess.file_exists(path.get_basename() + INFO):
		DirAccess.remove_absolute(path.get_basename() + INFO)
	return ""


func _entry(path: String, fallback: String) -> Dictionary:
	var entry := {"path": path, "name": fallback, "time": "",
		"saved": float(FileAccess.get_modified_time(path))}
	var info_path := path.get_basename() + INFO
	var info: Variant = null
	if FileAccess.file_exists(info_path):
		info = JSON.parse_string(FileAccess.get_file_as_string(info_path))
	if info is Dictionary:
		if info.get("name") is String and info["name"] != "" and fallback != "Quick save":
			entry["name"] = info["name"]
		if info.get("time") is String:
			entry["time"] = info["time"]
		if info.get("saved") is float:
			entry["saved"] = info["saved"]
	return entry


func _file(name: String) -> String:
	return name.validate_filename()


func _path(file: String) -> String:
	return ProjectSettings.globalize_path(dir.path_join(_file(file)))
