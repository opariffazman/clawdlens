import { test, expect } from "bun:test";
import { ICON_ART_7, ICON_ART_13, LABEL_ART, LABEL_H } from "../src/ui/panels/lens/iconArt";

const KEYS = ["bash", "edit", "prompt", "read", "result", "search", "skill", "task", "text", "thinking", "todo", "tool", "web"].sort();
const BRAILLE = /^[⠀-⣿ ]+$/u; // braille patterns + space — single-width everywhere
const MINIWI = /^[─-╿▀-▟ ]+$/u; // box drawing + block elements + space

test("ICON_ART_7: all 13 keys, 3 rows x 7 cols, braille-only", () => {
  expect(Object.keys(ICON_ART_7).sort()).toEqual(KEYS);
  for (const rows of Object.values(ICON_ART_7)) {
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect([...row].length).toBe(7);
      expect(BRAILLE.test(row)).toBe(true);
    }
  }
});

test("ICON_ART_13: all 13 keys, 5 rows x 13 cols, braille-only", () => {
  expect(Object.keys(ICON_ART_13).sort()).toEqual(KEYS);
  for (const rows of Object.values(ICON_ART_13)) {
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect([...row].length).toBe(13);
      expect(BRAILLE.test(row)).toBe(true);
    }
  }
});

test("LABEL_ART: five node names, uniform LABEL_H rows, equal width per label, block glyphs", () => {
  expect(Object.keys(LABEL_ART).sort()).toEqual(["chat", "prompt", "result", "think", "tool"]);
  expect(LABEL_H).toBeGreaterThanOrEqual(3);
  expect(LABEL_H).toBeLessThanOrEqual(4);
  for (const rows of Object.values(LABEL_ART)) {
    expect(rows.length).toBe(LABEL_H);
    const w = [...rows[0]!].length;
    expect(w).toBeGreaterThan(0);
    for (const row of rows) {
      expect([...row].length).toBe(w);
      expect(MINIWI.test(row)).toBe(true);
    }
  }
});
