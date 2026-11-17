#!/usr/bin/env bash
# Headless checks of the game's screens (game/tests/*_test.gd): each one
# starts the game without a window or sound, clicks through a screen like a
# player would and checks what happened. Builds the Rust extension and
# imports the Godot project first when needed.
#
#   native/test-screens.sh          run them all
#   native/test-screens.sh war      run game/tests/war_test.gd only
#
# A test fails when one of its checks fails, when Godot reports a script or
# engine error, or when it ends without saying "ok" (it hung or crashed).
# Each test's whole output is kept in native/target/screen-tests/.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
godot=${GODOT:-godot-beta}
"$here/play.sh" --prepare >/dev/null

tests=()
if (($#)); then
	for name in "$@"; do
		name=${name%.gd}
		name=${name%_test}
		if [ ! -f "$here/game/tests/${name}_test.gd" ]; then
			echo "No such test: game/tests/${name}_test.gd" >&2
			exit 2
		fi
		tests+=("${name}_test.gd")
	done
else
	for path in "$here"/game/tests/*_test.gd; do
		tests+=("$(basename "$path")")
	done
fi

logs="$here/target/screen-tests"
mkdir -p "$logs"
errors="SCRIPT ERROR|Parse Error|^ERROR:"
failed=0
for test in "${tests[@]}"; do
	log="$logs/${test%.gd}.log"
	status=0
	# A test that hangs (a script error stops it before it quits) is cut
	# off; --foreground lets Ctrl+C reach Godot. No core dump of a crash.
	(ulimit -c 0 && timeout --foreground -k 5 90 "$godot" --headless --path "$here/game" \
		--audio-driver Dummy --script "res://tests/$test") >"$log" 2>&1 || status=$?
	grep -E "^FAILED|$errors" "$log" || true
	summary=$(grep -E "^$test: " "$log" || true)
	if [ "$status" -eq 0 ] && [ "$summary" = "$test: ok" ] && ! grep -qE "$errors" "$log"; then
		echo "$test: ok"
		continue
	fi
	failed=1
	if [ -z "$summary" ]; then
		echo "$test: no result (exit code $status: it hung or crashed). Its last lines:"
		tail -n 15 "$log" | sed 's/^/    /'
	elif [ "$summary" = "$test: ok" ]; then
		echo "$test: errors above (exit code $status)"
	else
		echo "$summary"
	fi
	echo "    whole output: $log"
done
exit "$failed"
