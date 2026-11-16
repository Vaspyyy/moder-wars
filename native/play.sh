#!/usr/bin/env bash
# Build the Rust extension and open the native game.
#
#   native/play.sh                  build, then open the game
#   native/play.sh --watch          same, then keep following main: when new
#                                   commits land, pull, rebuild and restart
#   native/play.sh --scenario=ukraine-2023-v3 --view=34,48.5,9
#                                   any other option goes to the game
#
# Close the game window (or press Ctrl+C here) to stop.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
godot=${GODOT:-godot-beta}
interval=${PLAY_WATCH_SECONDS:-30}
watch=0
args=()
for arg in "$@"; do
	case $arg in
	--watch) watch=1 ;;
	-h | --help)
		sed -n 2,10p "$0"
		exit 0
		;;
	*) args+=("$arg") ;;
	esac
done

build() {
	echo "Building the Rust extension (the first build takes a minute or two)..."
	(cd "$here" && cargo build --quiet -p mw-godot)
}

build
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
	if build; then
		kill "$game" 2>/dev/null || true
		wait "$game" 2>/dev/null || true
		launch
	else
		echo "The build failed; the game keeps running the previous version."
	fi
done
