#!/usr/bin/env bash
# Regenerate the per-panel hero shots in assets/panels/*.png.
#
#   ./assets/capture-panels.sh
#
# It pins ONE rich, finished session (the original "Build TUI dashboard…" build of
# clawdlens itself) and screenshots every panel at a full timeline, so each image shows
# that panel at its glory. The plain-Unicode icon set is used so it renders without a
# Nerd Font installed.
#
# Why one VHS invocation per panel (instead of one tape that Tabs through all five):
# under VHS's headless (ttyd) renderer a single long session is flaky — the `:` command
# box (a transparent overlay) intermittently leaves stale cells, relative Tab navigation
# occasionally lands on the wrong panel, and quitting + relaunching inside one tape races
# the shell. A FRESH foreground launch that does a SINGLE `:` navigation, then shoots,
# sidesteps all of it. Must run in the FOREGROUND (VHS needs an interactive terminal).
#
# Re-record elsewhere: change SESSION below to a `:` filter matching one of YOUR richest
# finished sessions (pinned via the `proj` alias, then project, then session).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="harness-flow"   # picker: project filter
SESSION="dashboard"      # picker: session-title filter
OUT="assets/panels"
TAPE="$(mktemp --suffix=.tape)"
trap 'rm -f "$TAPE" "$OUT/_discard.png"' EXIT
mkdir -p "$OUT"

shoot () {              # $1 = panel alias (lens|files|tasks|git|log)  $2 = settle ms
  local panel="$1" settle="$2"
  cat > "$TAPE" <<EOF
Set Shell "bash"
Set FontSize 13
Set Width 1320
Set Height 760
Set Padding 14
Set Framerate 24
Set TypingSpeed 90ms
Type "CL_ICONS=unicode bun run dev"
Enter
Sleep 7s
Type ":"
Sleep 800ms
Type "proj"
Sleep 500ms
Enter
Sleep 1200ms
Type "/"
Type "$PROJECT"
Sleep 900ms
Enter
Sleep 1200ms
Type "/"
Type "$SESSION"
Sleep 1s
Enter
Sleep 1500ms
Type "l"
Sleep 2500ms
Type ":"
Sleep 400ms
Type "$panel"
Sleep 400ms
Enter
Sleep ${settle}ms
Screenshot $OUT/$panel.png
EOF
  # lens also wants the `i` tool-breakdown variant, captured in the same launch
  if [ "$panel" = lens ]; then
    cat >> "$TAPE" <<EOF
Type "i"
Sleep 1500ms
Screenshot $OUT/lens-tools.png
EOF
  fi
  # trailing throwaway so the real shot isn't the final command (VHS races teardown)
  cat >> "$TAPE" <<EOF
Sleep 1200ms
Screenshot $OUT/_discard.png
Sleep 500ms
EOF
  echo ">> $panel"
  vhs "$TAPE"
}

# Note: if VHS comes up with the Lens detail toggle already on, lens.png and
# lens-tools.png arrive swapped — eyeball them and `mv`-swap if so.
shoot lens  1500   # -> lens.png (default) + lens-tools.png (i = per-tool breakdown)
shoot files 2000   # -> files.png
shoot tasks 2000   # -> tasks.png
shoot git   3500   # -> git.png  (git graph is fetched + built up on entry; settle longer)
shoot log   2000   # -> log.png
echo "done -> $OUT/"
