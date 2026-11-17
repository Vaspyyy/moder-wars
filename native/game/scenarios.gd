extends RefCounted
## What each scenario sets up beyond its map package: the wars already going
## on when it starts, as [attacker, defender] country names.

const WARS := {
	"ukraine-2023-v3": [["Russia", "Ukraine"]],
}


## The wars `scenario` (a package name) starts with.
static func wars(scenario: String) -> Array:
	return WARS.get(scenario, [])
