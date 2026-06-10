import { test, expect } from "bun:test";
import { ICON_ART, ART_W, ART_H } from "../src/ui/panels/lens/iconArt";

// Box drawing U+2500-257F, blocks U+2580-259F, geometric U+25A0-25FF, space.
// All single-cell-wide — protects against the tmux wide-glyph ghosting gotcha.
const ALLOWED = /^[─-╿▀-▟■-◿ ]+$/u;

test("every art is exactly ART_H rows of ART_W single-width glyphs", () => {
  for (const [key, rows] of Object.entries(ICON_ART)) {
    expect(rows.length).toBe(ART_H);
    for (const row of rows) {
      expect([...row].length).toBe(ART_W);
      expect(ALLOWED.test(row)).toBe(true);
    }
  }
});

test("covers all 12 IconKeys plus prompt", () => {
  const keys = Object.keys(ICON_ART).sort();
  expect(keys).toEqual(["bash", "edit", "prompt", "read", "result", "search", "skill", "task", "text", "thinking", "todo", "tool"].sort());
});
