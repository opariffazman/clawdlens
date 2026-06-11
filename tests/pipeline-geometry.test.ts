import { test, expect } from "bun:test";
import { nodeLayout, BOX_W, BOX_W_WIDE, BOX_W_NARROW, BOX_H_ART, BOX_H_GLYPH, borderCells, portIn, portOut, badgeCell, diamondCell, boltCell, wireForward, wireLoop, subRow, subPortCell, SUB_W, SUB_H, SUB_PITCH, PITCH_MIN, SUB_ROWS, LEFT, TOP } from "../src/core/pipeline-geometry";

test("nodeLayout full width: trigger + labels, 5 boxes in row order, non-overlapping", () => {
  const nl = nodeLayout(150, TOP, "art");
  expect(nl.row).toEqual(["prompt", "think", "tool", "result", "chat"]);
  expect(nl.showTrigger).toBe(true);
  expect(nl.showLabels).toBe(true);
  expect(nl.boxW).toBe(BOX_W_WIDE);
  expect(nl.wide).toBe(true);
  expect(nl.boxH).toBe(BOX_H_ART);
  const rects = nl.row.map((k) => nl.boxes.get(k)!);
  for (let i = 0; i + 1 < rects.length; i++) expect(rects[i + 1]!.x).toBeGreaterThan(rects[i]!.x + rects[i]!.w);
});

test("nodeLayout width ladder: labels drop, then trigger drops, then boxes narrow", () => {
  expect(nodeLayout(104, TOP, "art").showLabels).toBe(false);
  expect(nodeLayout(104, TOP, "art").showTrigger).toBe(true);
  const noTrig = nodeLayout(80, TOP, "art");
  expect(noTrig.showTrigger).toBe(false);
  expect(noTrig.row).toEqual(["think", "tool", "result", "chat"]);
  expect(noTrig.boxW).toBe(BOX_W);
  expect(nodeLayout(60, TOP, "art").boxW).toBe(BOX_W_NARROW);
  expect(nodeLayout(105, TOP, "art").showLabels).toBe(true);   // exact label threshold
  expect(nodeLayout(71, TOP, "art").boxW).toBe(BOX_W);         // exact narrow threshold
  expect(nodeLayout(70, TOP, "art").boxW).toBe(BOX_W_NARROW);
});

test("nodeLayout wide tier: 17-col boxes at width>=125 in art mode only", () => {
  expect(nodeLayout(125, TOP, "art").wide).toBe(true);
  expect(nodeLayout(125, TOP, "art").boxW).toBe(BOX_W_WIDE);
  expect(nodeLayout(124, TOP, "art").wide).toBe(false);
  expect(nodeLayout(124, TOP, "art").boxW).toBe(BOX_W);
  expect(nodeLayout(150, TOP, "glyph").wide).toBe(false);   // wide is art-only
  expect(nodeLayout(150, TOP, "glyph").boxW).toBe(BOX_W);
});

test("nodeLayout glyph mode uses the short box height", () => {
  expect(nodeLayout(150, TOP, "glyph").boxH).toBe(BOX_H_GLYPH);
  expect(nodeLayout(150, 5, "glyph").boxes.get("think")!.y).toBe(5);
});

test("borderCells walks clockwise from top-left with sharp corners", () => {
  const cells = borderCells({ x: 2, y: 1, w: 4, h: 3 });
  expect(cells.length).toBe(2 * 4 + 2 * 3 - 4);
  expect(cells[0]).toEqual({ x: 2, y: 1, ch: "┌" });
  expect(cells[3]).toEqual({ x: 5, y: 1, ch: "┐" });
  expect(cells.find((c) => c.x === 5 && c.y === 3)!.ch).toBe("┘");
  expect(cells.find((c) => c.x === 2 && c.y === 3)!.ch).toBe("└");
  expect(cells[cells.length - 1]).toEqual({ x: 2, y: 2, ch: "│" });
});

test("borderCells roundedLeft makes the trigger half-pill", () => {
  const cells = borderCells({ x: 2, y: 1, w: 4, h: 3 }, true);
  expect(cells[0]!.ch).toBe("╭");
  expect(cells.find((c) => c.x === 2 && c.y === 3)!.ch).toBe("╰");
  expect(cells[3]!.ch).toBe("┐");
});

test("port/badge/diamond/bolt cells sit on the border at the spec positions", () => {
  const r = { x: 10, y: 2, w: 13, h: 7 };
  expect(portIn(r)).toEqual({ x: 10, y: 5 });
  expect(portOut(r)).toEqual({ x: 22, y: 5 });
  expect(badgeCell(r)).toEqual({ x: 21, y: 8 });
  expect(diamondCell(r)).toEqual({ x: 16, y: 8 });
  expect(boltCell(r)).toEqual({ x: 9, y: 5 });
});

test("wireForward runs ─ between boxes and lands ▶ before the input port", () => {
  const a = { x: 2, y: 1, w: 13, h: 7 };
  const b = { x: 24, y: 1, w: 13, h: 7 };
  const cells = wireForward(a, b);
  expect(cells[0]).toEqual({ x: 15, y: 4, ch: "─" });
  expect(cells[cells.length - 1]).toEqual({ x: 23, y: 4, ch: "▶" });
  expect(cells.every((c) => c.y === 4)).toBe(true);
});

test("wireForward embeds the ×N label mid-wire when it fits, omits it when not", () => {
  const a = { x: 2, y: 1, w: 13, h: 7 };
  const b = { x: 24, y: 1, w: 13, h: 7 };
  const labelled = wireForward(a, b, "×42");
  expect(labelled.map((c) => c.ch).join("")).toContain("×42");
  const tight = wireForward(a, { x: 19, y: 1, w: 13, h: 7 }, "×42424242");
  expect(tight.map((c) => c.ch).join("")).not.toContain("×4");
});

test("wireLoop routes a rounded U below the row into the target's input port", () => {
  const a = { x: 50, y: 1, w: 13, h: 7 };   // chat
  const b = { x: 2, y: 1, w: 13, h: 7 };    // think
  const cells = wireLoop(a, b, 12);
  expect(cells[0]).toEqual({ x: 63, y: 4, ch: "╮" });
  expect(cells.find((c) => c.ch === "╯")).toEqual({ x: 63, y: 12, ch: "╯" });
  expect(cells.find((c) => c.ch === "╰")).toEqual({ x: 0, y: 12, ch: "╰" });
  expect(cells.find((c) => c.ch === "╭")).toEqual({ x: 0, y: 4, ch: "╭" });
  expect(cells[cells.length - 1]).toEqual({ x: 1, y: 4, ch: "▶" });
});

test("subRow pitch resolves to SUB_PITCH at the legacy label budget, centered under the diamond", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };       // diamond at x=66, y=8
  const sr = subRow(tool, 2, 150, 14);             // maxLabelLen 14 → want 16 → pitch 16
  expect(sr.shown).toBe(2);
  expect(sr.circles.length).toBe(2);
  const c0 = sr.circles[0]!, c1 = sr.circles[1]!;
  expect(c1.x - c0.x).toBe(SUB_PITCH);             // 16
  expect(sr.labelW).toBe(SUB_PITCH - 1);           // 15
  expect(c0.w).toBe(SUB_W);
  expect(c0.h).toBe(SUB_H);
  expect(c0.y).toBe(8 + 4);
  expect(sr.labelY).toBe(8 + SUB_ROWS);
  const fan = sr.cells.filter((c) => c.y === 10);
  expect(fan.find((c) => c.ch === "╭")).toBeTruthy();
  expect(fan.find((c) => c.ch === "╮")).toBeTruthy();
  expect(fan.find((c) => c.x === 66)!.ch).toBe("┴");
});

test("subRow spreads pitch toward full labels when wide with few items", () => {
  const tool = { x: 80, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 2, 200, 30);             // lots of slack, long labels
  expect(sr.shown).toBe(2);
  const c0 = sr.circles[0]!, c1 = sr.circles[1]!;
  expect(c1.x - c0.x).toBe(32);                    // want = 30 + 2, fits
  expect(sr.labelW).toBe(31);                      // pitch - 1
});

test("subRow floors pitch and overflows shown when many tools crowd the width", () => {
  const tool = { x: 50, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 20, 120, 20);            // 20 items, tight columns
  expect(sr.shown).toBe(14);                       // capped → caller shows +6 more
  const c0 = sr.circles[0]!, c1 = sr.circles[1]!;
  expect(c1.x - c0.x).toBe(PITCH_MIN);             // floored to 8
  expect(sr.labelW).toBe(PITCH_MIN - 1);           // 7
});

test("subRow with one aligned child is a straight dashed drop", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 1, 150, 10);
  expect(sr.shown).toBe(1);
  expect(sr.cells.every((c) => c.ch === "┆")).toBe(true);
  expect(sr.labelW).toBe(11);   // want = 10 + 2 = 12, pitch = 12, labelW = 11
});

test("subRow caps shown by width and clamps circles inside the panel", () => {
  const tool = { x: 10, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 8, 60, 10);
  expect(sr.shown).toBeLessThan(8);
  for (const c of sr.circles) {
    expect(c.x).toBeGreaterThanOrEqual(LEFT);
    expect(c.x + c.w).toBeLessThanOrEqual(58);
  }
});

test("subPortCell is the circle's top-center", () => {
  expect(subPortCell({ x: 10, y: 5, w: 5, h: 3 })).toEqual({ x: 12, y: 5 });
});

test("subRow with zero items (or no width) is empty", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };
  expect(subRow(tool, 0, 150, 10).shown).toBe(0);
  expect(subRow(tool, 0, 150, 10).cells).toEqual([]);
  expect(subRow(tool, 0, 150, 10).labelW).toBe(0);
  expect(subRow(tool, 3, 5, 10).shown).toBe(0);
});
