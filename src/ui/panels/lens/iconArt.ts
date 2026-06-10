import type { IconKey } from "../../../core/types";

// Hand-crafted n8n-style "huge" icons: 7×3 cells of single-width block/box/
// geometric glyphs ONLY (no emoji/wide glyphs — tmux ghosting gotcha).
// Visual polish is welcome as long as tests/icon-art.test.ts stays green.
export const ART_W = 7;
export const ART_H = 3;

export type ArtKey = IconKey | "prompt";

export const ICON_ART: Record<ArtKey, [string, string, string]> = {
  prompt:   ["▗▄▄▄▄▄▖", "▐█████▌", " ▝▜▘▀▀ "],  // speech bubble, tail left
  thinking: [" ▄███▄ ", " ▀███▀ ", "  ▘█▝  "],  // lightbulb
  text:     ["▗▄▄▄▄▄▖", "▐ ▪ ▪ ▌", " ▀▀▀▜▘ "],  // chat bubble, typing dots
  tool:     ["▗▖ ▗▄▖ ", " ▜█▛▀▘ ", "  ▐█▖  "],  // wrench
  bash:     ["▛▀▀▀▀▀▜", "▌▸ ▖  ▐", "▙▄▄▄▄▄▟"],  // terminal, prompt caret
  edit:     ["    ▗▄▖", "  ▗▟█▛ ", " ▟█▛▘  "],  // pencil, diagonal
  read:     ["▛▀▀▀▀▜ ", "▌▪▪▪ ▐ ", "▙▄▄▄▄▟ "],  // document with lines
  search:   [" ▄▀▀▄  ", " ▀▄▄▀  ", "    ▝▙ "],  // magnifier
  task:     ["  ▟█▙  ", " ▞ █ ▚ ", "▐▌▐█▌▐▌"],  // fan-out / sitemap
  skill:    ["  ▗▙▖  ", "▄▟███▙▄", " ▝▛▀▜▘ "],  // star
  todo:     ["▣ ▬▬▬▬ ", "▣ ▬▬▬▬ ", "▢ ▬▬▬▬ "],  // checklist
  result:   ["     ▗▟", "▜▖  ▟▛ ", " ▜▄▟▘  "],  // check mark
};
