#!/usr/bin/env bash
# Build the Rust extension and open the native game.
#
#   native/play.sh                  build, then open the game
#   native/play.sh --watch          same, then keep following main: when new
#                                   commits land, pull, rebuild and restart
#   native/play.sh --scenario=ukraine-2023-v3 --view=34,48.5,9
#                                   any other option goes to the game
#   native/play.sh --prepare        build and import only, then stop (for
#                                   test-screens.sh)
#
# Close the game window (or press Ctrl+C here) to stop.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
godot=${GODOT:-godot-beta}
interval=${PLAY_WATCH_SECONDS:-30}
watch=0
prepare=0
args=()
for arg in "$@"; do
	case $arg in
	--watch) watch=1 ;;
	--prepare) prepare=1 ;;
	-h | --help)
		sed -n 2,12p "$0"
		exit 0
		;;
	*) args+=("$arg") ;;
	esac
done

build() {
	echo "Building the Rust extension (the first build takes a minute or two)..."
	(cd "$here" && cargo build --quiet -p mw-godot)
}

# Godot only loads GDExtensions listed in game/.godot/extension_list.cfg,
# which its import step writes. A fresh checkout has no .godot folder, so
# import on the first run and whenever files under game/ changed since.
import_project() {
	local game="$here/game" stamp="$here/game/.godot/.play-imported"
	if [ -f "$game/.godot/extension_list.cfg" ] && [ -f "$stamp" ] &&
		[ -z "$(find "$game" -path "$game/.godot" -prune -o -newer "$stamp" -print -quit)" ]; then
		return 0
	fi
	echo "Importing the Godot project..."
	# The editor's import step aborts while shutting down once the Rust
	# extension is loaded (Godot 4.7.2 and 4.8 beta3 alike), after it has
	# written everything. Judge it by the extension list, not the exit code,
	# and skip the core dump.
	(ulimit -c 0 && "$godot" --headless --path "$game" --import) >"$here/target/godot-import.log" 2>&1 || true
	if [ ! -f "$game/.godot/extension_list.cfg" ]; then
		echo "Importing the Godot project failed; see native/target/godot-import.log"
		return 1
	fi
	touch "$stamp"
}

build
import_project
if ((prepare)); then
	exit 0
fi
if ((!watch)); then
	exec "$godot" --path "$here/game" -- "${args[@]}"
fi

repo=$(git -C "$here" rev-parse --show-toplevel)
branch=$(git -C "$repo" branch --show-current)
if ! git -C "$repo" rev-parse -q --verify "origin/$branch" >/dev/null; then
	echo "--watch follows origin/$branch, which does not exist. Switch to main first."
	exit 1
fi

game=""
launch() {
	"$godot" --path "$here/game" -- "${args[@]}" &
	game=$!
}
trap '[ -n "$game" ] && kill "$game" 2>/dev/null' EXIT
launch
echo "Watching origin/$branch for new commits (checks every $interval s)."
while true; do
	sleep "$interval"
	if ! kill -0 "$game" 2>/dev/null; then
		echo "The game was closed; stopping."
		exit 0
	fi
	git -C "$repo" fetch -q origin "$branch" || continue
	[ "$(git -C "$repo" rev-parse HEAD)" = "$(git -C "$repo" rev-parse "origin/$branch")" ] && continue
	if ! git -C "$repo" merge -q --ff-only "origin/$branch"; then
		echo "Cannot fast-forward to origin/$branch (local changes or commits?); not updating."
		continue
	fi
	echo "Updated to: $(git -C "$repo" log -1 --format='%h %s')"
	if build && import_project; then
		kill "$game" 2>/dev/null || true
		wait "$game" 2>/dev/null || true
		launch
	else
		echo "The build failed; the game keeps running the previous version."
	fi
done
