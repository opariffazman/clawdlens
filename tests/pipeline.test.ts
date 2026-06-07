import { test, expect } from "bun:test";
import { buildPipeline, edgeVisible, EDGE_MIN_FRAC } from "../src/core/pipeline";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return {
    id: p.id ?? "b", ts: p.ts ?? 0, kind: p.kind ?? "tool",
    iconKey: p.iconKey ?? "tool", label: p.label ?? "L", count: p.count ?? 1,
    lane: p.lane ?? "main", ...p,
  };
}

test("empty beats -> empty graph", () => {
  const g = buildPipeline([]);
  expect(g.nodes).toEqual([]);
  expect(g.edges).toEqual([]);
  expect(g.maxCount).toBe(0);
  expect(g.maxWeight).toBe(0);
});

test("beat kinds map to pipe kinds; wait/phase ignored", () => {
  const g = buildPipeline([
    beat({ kind: "thinking" }),
    beat({ kind: "text" }),
    beat({ kind: "skill" }),
    beat({ kind: "tool" }),       // no ok -> no synthetic result
    beat({ kind: "wait" }),
    beat({ kind: "phase" }),
  ]);
  expect(g.nodes.map((n) => n.kind).sort()).toEqual(["chat", "skill", "think", "tool"]);
  expect(g.nodes.find((n) => n.kind === "result")).toBeUndefined();
});

test("completed tool synthesizes a result node with ok/err split", () => {
  const g = buildPipeline([
    beat({ kind: "tool", ok: true }),
    beat({ kind: "tool", ok: false }),
    beat({ kind: "tool", ok: true }),
  ]);
  const result = g.nodes.find((n) => n.kind === "result")!;
  expect(result.count).toBe(3);
  expect(result.ok).toBe(2);
  expect(result.err).toBe(1);
});

test("pending tool (ok undefined) makes no result", () => {
  const g = buildPipeline([beat({ kind: "tool" })]);
  expect(g.nodes.find((n) => n.kind === "result")).toBeUndefined();
  expect(g.nodes.find((n) => n.kind === "tool")!.count).toBe(1);
});

test("node count includes consecutive duplicates", () => {
  const g = buildPipeline([beat({ kind: "thinking" }), beat({ kind: "thinking" }), beat({ kind: "tool" })]);
  expect(g.nodes.find((n) => n.kind === "think")!.count).toBe(2);
});

test("edges come from the coalesced sequence -> no self-edges", () => {
  const g = buildPipeline([beat({ kind: "thinking" }), beat({ kind: "thinking" }), beat({ kind: "tool" })]);
  expect(g.edges.some((e) => e.from === e.to)).toBe(false);
  expect(g.edges.find((e) => e.from === "think" && e.to === "tool")!.weight).toBe(1);
});

test("edge weights accumulate over repeated transitions", () => {
  const g = buildPipeline([
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
  ]);
  expect(g.edges.find((e) => e.from === "think" && e.to === "tool")!.weight).toBe(2);
  expect(g.edges.find((e) => e.from === "tool" && e.to === "think")!.weight).toBe(1);
});

test("back-edge classification by column order", () => {
  const g = buildPipeline([
    beat({ kind: "tool", ok: true }), // steps: tool, result
    beat({ kind: "thinking" }),       // result -> think (back)
    beat({ kind: "skill" }),          // think -> skill (fwd 0->1)
    beat({ kind: "tool" }),           // skill -> tool (back, equal col 1)
  ]);
  const get = (f: string, t: string) => g.edges.find((e) => e.from === f && e.to === t)!;
  expect(get("tool", "result").back).toBe(false);
  expect(get("result", "think").back).toBe(true);
  expect(get("think", "skill").back).toBe(false);
  expect(get("skill", "tool").back).toBe(true);
});

test("edgeVisible thresholds rare edges but keeps the floor", () => {
  expect(edgeVisible(40, 40)).toBe(true);
  expect(edgeVisible(1, 40)).toBe(false); // ceil(0.05*40)=2 -> 1 dropped
  expect(edgeVisible(1, 10)).toBe(true);  // ceil(0.05*10)=1 -> floor keeps it
  expect(EDGE_MIN_FRAC).toBe(0.05);
});

test("maxCount and maxWeight reflect the largest node/edge", () => {
  const g = buildPipeline([
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
    beat({ kind: "thinking" }),
  ]);
  expect(g.maxCount).toBe(3);  // think x3
  expect(g.maxWeight).toBe(2); // think->tool x2
});

import { slotOf } from "../src/core/pipeline";

test("slotOf returns the fixed stage slots", () => {
  expect(slotOf("think")).toEqual({ col: 0, row: 0 });
  expect(slotOf("tool")).toEqual({ col: 1, row: 0 });
  expect(slotOf("skill")).toEqual({ col: 1, row: 1 });
  expect(slotOf("result")).toEqual({ col: 2, row: 0 });
  expect(slotOf("chat")).toEqual({ col: 3, row: 0 });
});
