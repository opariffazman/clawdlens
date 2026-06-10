import { test, expect } from "bun:test";
import { coarseLayout, pipeForward, pipeElbow, pipeReturn, pipeBranch, expandStack, railCells, railSegment, LEFT, TOP } from "../src/core/pipeline-geometry";
import { nodeLayout, BOX_W, BOX_W_NARROW, BOX_H_ART, BOX_H_GLYPH, borderCells, portIn, portOut, badgeCell, diamondCell, boltCell, wireForward, wireLoop, subRow, subPortCell, SUB_W, SUB_H, SUB_PITCH, SUB_ROWS } from "../src/core/pipeline-geometry";
import type { PipeKind } from "../src/core/pipeline";

test("pipeForward is a horizontal run on the mid-row ending in an arrowhead at the target port", () => {
  const a = { x: 2, y: 1, w: 13, h: 3 };
  const b = { x: 25, y: 1, w: 13, h: 3 };
  const cells = pipeForward(a, b);
  const my = a.y + (a.h >> 1);
  expect(cells.every((c) => c.y === my)).toBe(true);
  expect(cells.every((c) => c.x >= a.x + a.w && c.x < b.x)).toBe(true);
  expect(cells.slice(0, -1).every((c) => c.ch === "━")).toBe(true); // heavy run
  expect(cells[cells.length - 1]!.ch).toBe("▶");
  expect(cells[cells.length - 1]!.x).toBe(b.x - 1);
});

test("pipeReturn is a U below: corners + a left arrowhead on the channel row", () => {
  const a = { x: 48, y: 1, w: 13, h: 3 };
  const b = { x: 2, y: 1, w: 13, h: 3 };
  const channelY = a.y + a.h;
  const cells = pipeReturn(a, b, channelY);
  expect(cells.some((c) => c.ch === "╯")).toBe(true);
  expect(cells.some((c) => c.ch === "╰")).toBe(true);
  expect(cells.some((c) => c.ch === "◀")).toBe(true);
  expect(cells.some((c) => c.y === channelY)).toBe(true);
});

test("pipeReturn drops a connecting stem when the channel is below the card bottom", () => {
  const a = { x: 48, y: 1, w: 13, h: 3 };
  const b = { x: 2, y: 1, w: 13, h: 3 };
  const channelY = a.y + a.h + 2; // a real channel below the cards
  const cells = pipeReturn(a, b, channelY);
  const ax = a.x + (a.w >> 1);
  const bx = b.x + (b.w >> 1);
  // a vertical stem on the source side connecting the card bottom down to the channel
  expect(cells.some((c) => c.ch === "│" && c.x === ax && c.y === a.y + a.h)).toBe(true);
  // and a rising stem on the target side
  expect(cells.some((c) => c.ch === "│" && c.x === bx && c.y < channelY && c.y >= b.y + b.h)).toBe(true);
});

test("pipeBranch trunks from the parent and tees into each child", () => {
  const parent = { x: 25, y: 1, w: 13, h: 3 };
  const children = expandStack(parent, 3);
  const cells = pipeBranch(parent, children);
  expect(cells.some((c) => c.ch === "│")).toBe(true);
  expect(cells.filter((c) => c.ch === "├" || c.ch === "└").length).toBe(3);
  expect(cells.filter((c) => c.ch === "└").length).toBe(1);
});

test("expandStack stacks n single-row child rects below the parent", () => {
  const parent = { x: 25, y: 1, w: 13, h: 3 };
  const rects = expandStack(parent, 3);
  expect(rects.length).toBe(3);
  expect(rects.every((r) => r.h === 1)).toBe(true);
  expect(rects.every((r) => r.y >= parent.y + parent.h)).toBe(true);
  expect(rects[0]!.y).toBeLessThan(rects[1]!.y);
  expect(rects[1]!.y).toBeLessThan(rects[2]!.y);
});

test("coarseLayout spreads four cards across the width in flow order, non-overlapping", () => {
  const m = coarseLayout(160, TOP);
  const order = ["think", "tool", "result", "chat"].map((k) => m.get(k as PipeKind)!);
  for (let i = 1; i < order.length; i++) {
    expect(order[i]!.x).toBeGreaterThan(order[i - 1]!.x + order[i - 1]!.w);
    expect(order[i]!.y).toBe(TOP);
  }
  const last = order[3]!;
  expect(last.x + last.w).toBeLessThanOrEqual(160);
  expect(last.x + last.w).toBeGreaterThanOrEqual(160 - 4); // fills close to the full width
});

test("coarseLayout caps card width and pushes slack into the gaps", () => {
  const narrow = coarseLayout(80, TOP);
  const wide = coarseLayout(200, TOP);
  const gap = (m: Map<any, any>) => m.get("tool")!.x - (m.get("think")!.x + m.get("think")!.w);
  expect(wide.get("think")!.w).toBeLessThanOrEqual(18); // cardW capped
  expect(gap(wide)).toBeGreaterThan(gap(narrow)); // wider terminal => fatter gaps
});

test("coarseLayout places the skill card one row below, between tool and result", () => {
  const m = coarseLayout(200, TOP);
  const skill = m.get("skill")!, tool = m.get("tool")!, result = m.get("result")!;
  expect(skill.y).toBeGreaterThan(tool.y + tool.h);
  expect(skill.x).toBeGreaterThanOrEqual(tool.x + tool.w);
  expect(skill.x + skill.w).toBeLessThanOrEqual(result.x);
});

test("coarseLayout keeps the skill card from overlapping tool at narrow widths", () => {
  const m = coarseLayout(80, TOP);
  const skill = m.get("skill")!, tool = m.get("tool")!;
  expect(skill.x).toBeGreaterThanOrEqual(tool.x + tool.w);
});

test("pipeElbow routes down the parent's right edge then into the child's left port", () => {
  const a = { x: 2, y: 1, w: 13, h: 3 };
  const b = { x: 40, y: 6, w: 13, h: 3 };
  const cells = pipeElbow(a, b);
  const by = b.y + (b.h >> 1); // child mid-row — the turn happens here
  expect(cells.some((c) => c.ch === "│" && c.x === a.x + a.w - 1)).toBe(true); // stem on a's right edge
  expect(cells.some((c) => c.ch === "╰" && c.x === a.x + a.w - 1 && c.y === by)).toBe(true); // corner on the turn-row
  expect(cells.filter((c) => c.ch === "─").every((c) => c.y === by)).toBe(true); // horizontal run on the turn-row
  expect(cells[cells.length - 1]!.ch).toBe("▶");
  expect(cells[cells.length - 1]!.x).toBe(b.x - 1);                            // arrow at b's left port
  expect(cells[cells.length - 1]!.y).toBe(by);                                // arrow on the turn-row
});

test("pipeElbow drops a left-trunk stem when the child sits directly below", () => {
  const a = { x: 2, y: 1, w: 13, h: 3 };
  const b = { x: 2, y: 9, w: 13, h: 3 };
  const cells = pipeElbow(a, b);
  const cx = a.x + 1; // left trunk, collinear with pipeBranch — clears left-aligned child labels
  expect(cells.every((c) => c.x === cx)).toBe(true);
  expect(cells[cells.length - 1]!.ch).toBe("▼");
  expect(cells[cells.length - 1]!.y).toBe(b.y);
});

test("railCells draws a horizontal bus above the cards with a tee + stub per card", () => {
  const cards = [
    { x: 2, y: 5, w: 10, h: 3 },
    { x: 20, y: 5, w: 10, h: 3 },
  ];
  const railY = 3;
  const cells = railCells(cards, railY);
  // the bus sits entirely on railY (only the stubs descend below it)
  expect(cells.filter((c) => c.ch === "━" || c.ch === "┯" || c.ch === "●" || c.ch === "▶").every((c) => c.y === railY)).toBe(true);
  for (const card of cards) {
    const sx = card.x + (card.w >> 1);
    expect(cells.some((c) => c.x === sx && c.y === railY && c.ch === "┯")).toBe(true);        // tee on the bus
    expect(cells.some((c) => c.x === sx && c.y > railY && c.y < card.y && c.ch === "│")).toBe(true); // stub toward the card
  }
  expect(cells.some((c) => c.ch === "●")).toBe(true); // origin
  expect(cells.some((c) => c.ch === "▶")).toBe(true); // terminus
});

test("railSegment is an ordered horizontal run between two cards' stub columns", () => {
  const a = { x: 2, y: 5, w: 10, h: 3 };  // stubX = 7
  const b = { x: 20, y: 5, w: 10, h: 3 }; // stubX = 25
  const railY = 3;
  const cells = railSegment(a, b, railY);
  expect(cells.every((c) => c.y === railY && c.ch === "━")).toBe(true);
  expect(cells[0]!.x).toBe(7);                  // flows from a's stub
  expect(cells[cells.length - 1]!.x).toBe(25);  // to b's stub
  // reversed when b is left of a
  const rev = railSegment(b, a, railY);
  expect(rev[0]!.x).toBe(25);
  expect(rev[rev.length - 1]!.x).toBe(7);
});

test("nodeLayout full width: trigger + labels, 5 boxes in row order, non-overlapping", () => {
  const nl = nodeLayout(150, TOP, "art");
  expect(nl.row).toEqual(["prompt", "think", "tool", "result", "chat"]);
  expect(nl.showTrigger).toBe(true);
  expect(nl.showLabels).toBe(true);
  expect(nl.boxW).toBe(BOX_W);
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

test("subRow lays circles at SUB_PITCH centered under the tool diamond", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };       // diamond at x=66, y=8
  const sr = subRow(tool, 2, 150);
  expect(sr.shown).toBe(2);
  expect(sr.circles.length).toBe(2);
  const c0 = sr.circles[0]!, c1 = sr.circles[1]!;
  expect(c1.x - c0.x).toBe(SUB_PITCH);
  expect(c0.w).toBe(SUB_W);
  expect(c0.h).toBe(SUB_H);
  // rows: ┆ at dy+1, fan at dy+2, ┆ at dy+3, circle top at dy+4, label at dy+7
  expect(c0.y).toBe(8 + 4);
  expect(sr.labelY).toBe(8 + SUB_ROWS);
  // fan glyphs: rounded ends, ┴ junction under the trunk
  const fan = sr.cells.filter((c) => c.y === 10);
  expect(fan.find((c) => c.ch === "╭")).toBeTruthy();
  expect(fan.find((c) => c.ch === "╮")).toBeTruthy();
  expect(fan.find((c) => c.x === 66)!.ch).toBe("┴");
});

test("subRow with one aligned child is a straight dashed drop", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 1, 150);
  expect(sr.shown).toBe(1);
  expect(sr.cells.every((c) => c.ch === "┆")).toBe(true);
});

test("subRow caps shown by width and clamps circles inside the panel", () => {
  const tool = { x: 10, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 8, 60);
  expect(sr.shown).toBeLessThan(8);
  for (const c of sr.circles) {
    expect(c.x).toBeGreaterThanOrEqual(LEFT);
    expect(c.x + c.w).toBeLessThanOrEqual(58);
  }
});

test("subPortCell is the circle's top-center", () => {
  expect(subPortCell({ x: 10, y: 5, w: 5, h: 3 })).toEqual({ x: 12, y: 5 });
});
