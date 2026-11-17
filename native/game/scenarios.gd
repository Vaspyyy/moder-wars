extends RefCounted
## The scenarios the Play screen offers, in its order, and what each one sets
## up beyond its map package. Each entry: `id` (the package in
## assets/maps/compiled), `short` (its name in lists of saves), `where` (the
## line under its name), `blurb`, `tag`
## ("" for a scenario at peace), `preview` (a picture of its map) and `wars`
## (already going on when it starts, as [attacker, defender] country names).
## Its name, start date and data credit come from the package itself.

const LIST := [
	{
		"id": "world-map-2026-v3",
		"short": "Modern World 2026",
		"where": "the whole world",
		"blurb": "Today's world, at peace: every country with its real army. Start a war, or wait for one to come to you.",
		"tag": "",
		"preview": "res://art/scenario-world-2026.png",
		"wars": [],
	},
	{
		"id": "ukraine-2023-v3",
		"short": "Ukraine 2023",
		"where": "Europe and Asia  ·  Russia and Ukraine at war",
		"blurb": "The front lines in Ukraine as they stood. Lead either side, or a neighbor watching the war.",
		"tag": "War under way",
		"preview": "res://art/scenario-ukraine-2023.png",
		"wars": [["Russia", "Ukraine"]],
	},
]


## The entry for a package name, or an empty dictionary.
static func find(id: String) -> Dictionary:
	for entry in LIST:
		if entry["id"] == id:
			return entry
	return {}


## The wars `scenario` (a package name) starts with.
static func wars(scenario: String) -> Array:
	return find(scenario).get("wars", [])
