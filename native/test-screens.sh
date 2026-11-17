#!/usr/bin/env bash
# Headless checks of the game's screens (game/tests/*_test.gd): each one
# starts the game without a window or sound, clicks through a screen like a
# player would and checks what happened. Builds the Rust extension and
# imports the Godot project first when needed.
#
#   native/test-screens.sh          run them all
#   native/test-screens.sh war      run game/tests/war_test.gd only
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
godot=${GODOT:-godot-beta}
"$here/play.sh" --prepare >/dev/null

if (($#)); then
	tests=("${@/%/_test.gd}")
else
	tests=()
	for path in "$here"/game/tests/*_test.gd; do
		tests+=("$(basename "$path")")
	done
fi

failed=0
for test in "${tests[@]}"; do
	# A test that hangs (a script error stops it before it quits) is cut
	# off; the core dump of a crash is not wanted.
	output=$( (ulimit -c 0 && timeout -k 5 90 "$godot" --headless --path "$here/game" \
		--audio-driver Dummy --script "res://tests/$test") 2>&1) || failed=1
	result=$(grep -E "^FAILED|^$test: |SCRIPT ERROR|Parse Error" <<<"$output" || true)
	if [ -z "$result" ]; then
		result="$test: no result (it hung or crashed)"
		failed=1
	fi
	echo "$result"
done
exit "$failed"
