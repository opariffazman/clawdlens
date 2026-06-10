# ClawdLens hero demo — pins one session and replays it so every panel shows the
# SAME session in sync: Lens ring orbit, energy pulse, file heatmap, tasks, git graph.
#
# Record:  vhs assets/demo.tape   ->  assets/demo.gif
# Uses the plain-Unicode icon set so it renders without a Nerd Font installed.
#
# NOTE: the `/website` filter below targets a local session on the author's machine.
# To re-record, change it to a `:` command palette query that matches one of YOUR
# sessions (or just press Enter twice to take the most-recent one), then `r` to replay.

Output assets/demo.gif

Set Shell "bash"
Set FontSize 13
Set Width 1320
Set Height 760
Set Padding 14
Set Framerate 24

# Boot the TUI off-camera, reveal once sessions have loaded.
Hide
Type "CL_ICONS=unicode bun run dev"
Enter
Sleep 5s
Show

# Pin a session: palette -> sessions -> filter to the clawdlens project -> pick it.
Type ":"
Sleep 800ms
Type "sessions"
Sleep 600ms
Enter
Sleep 1s
Type "/"
Type "website"
Sleep 1s
Enter
Sleep 800ms
Enter
Sleep 1200ms

# Replay from the top; crank the pace so panels fill while the Lens keeps animating.
Type "r"
Sleep 500ms
Right
Right
Right
Right
Right
Sleep 5500ms

# Lens is the star (above) — now sweep the rest with the timeline near full.
Tab
Sleep 2800ms
Tab
Sleep 2800ms
Tab
Sleep 2800ms
Tab
Sleep 3500ms
Tab
Sleep 3500ms

# Quit cleanly.
Hide
Type "q"
Sleep 1s
