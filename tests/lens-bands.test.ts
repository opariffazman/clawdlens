import { test, expect } from "bun:test";
import { tsToX, lensTimeline, heartbeatBuckets, economyView, toolTimingView, ctxBreakdownView } from "../src/core/lens-bands";
import type { Beat } from "../src/core/types";
import { newSessionTokens } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: p.id ?? "b", ts: p.ts ?? 0, kind: p.kind ?? "tool", iconKey: p.iconKey ?? "tool", label: p.label ?? "L", count: 1, lane: p.lane ?? "main", ...p };
}

test("tsToX maps start->0, end->width-1, monotonic, safe when start===end", () => {
  const r = { startTs: 100, endTs: 200, cursorTs: 200 };
  expect(tsToX(100, r, 50)).toBe(0);
  expect(tsToX(200, r, 50)).toBe(49);
  expect(tsToX(150, r, 50)).toBeGreaterThan(tsToX(120, r, 50));
  const deg = { startTs: 5, endTs: 5, cursorTs: 5 };
  expect(tsToX(5, deg, 50)).toBe(0); // no divide-by-zero
});

test("lensTimeline: skill spans abut and the last span ends at cursorTs", () => {
  const beats = [
    beat({ id: "s1", kind: "skill", skill: "brainstorming", label: "brainstorming", ts: 10 }),
    beat({ id: "t1", kind: "tool", skill: "brainstorming", label: "Read", ts: 15 }),
    beat({ id: "s2", kind: "skill", skill: "writing-plans", label: "writing-plans", ts: 20 }),
    beat({ id: "t2", kind: "tool", skill: "writing-plans", label: "Read", ts: 40 }),
  ];
  const tl = lensTimeline(beats, 4);
  expect(tl.range.startTs).toBe(10);
  expect(tl.range.endTs).toBe(40);
  expect(tl.range.cursorTs).toBe(40);
  expect(tl.skills.map((s) => s.label)).toEqual(["brainstorming", "writing-plans"]);
  expect(tl.skills[0]!.endTs).toBe(20);            // abuts the next group's start
  expect(tl.skills[1]!.endTs).toBe(40);            // last group -> cursorTs
});

test("lensTimeline: an agent span runs from the Task beat across its lane's beats", () => {
  const beats = [
    beat({ id: "T1", kind: "tool", iconKey: "task", label: "Task · code-reviewer", toolUseId: "L1", ts: 5 }),
    beat({ id: "a1", kind: "thinking", lane: "L1", ts: 7 }),
    beat({ id: "a2", kind: "tool", lane: "L1", label: "Grep", ts: 9 }),
    beat({ id: "m1", kind: "tool", label: "Bash", milestone: "commit", ts: 12 }),
  ];
  const tl = lensTimeline(beats, 4);
  expect(tl.agents.length).toBe(1);
  expect(tl.agents[0]!.label).toBe("code-reviewer");
  expect(tl.agents[0]!.startTs).toBe(5);
  expect(tl.agents[0]!.endTs).toBe(9);             // last beat on lane L1
  expect(tl.milestones).toEqual([{ ts: 12, kind: "commit" }]);
});

test("lensTimeline: cursorTs clamps to the revealed beat", () => {
  const beats = [beat({ ts: 10 }), beat({ ts: 20 }), beat({ ts: 30 })];
  expect(lensTimeline(beats, 2).range.cursorTs).toBe(20); // beats[cursor-1]
  expect(lensTimeline(beats, 0).range.cursorTs).toBe(10); // <=0 -> startTs
});

test("heartbeatBuckets: width buckets, only beats with index < cursor counted", () => {
  const beats = [
    beat({ kind: "thinking", ts: 0 }),
    beat({ kind: "tool", ts: 50 }),
    beat({ kind: "tool", ts: 100 }),
  ];
  const full = heartbeatBuckets(beats, 3, 10);
  expect(full.length).toBe(10);
  expect(full.reduce((n, b) => n + b.count, 0)).toBe(3);
  const partial = heartbeatBuckets(beats, 1, 10);
  expect(partial.reduce((n, b) => n + b.count, 0)).toBe(1); // only beats[0]
});

test("heartbeatBuckets: dominant kind per bucket; safe when start===end", () => {
  const beats = [beat({ kind: "tool", ts: 5 }), beat({ kind: "tool", ts: 5 }), beat({ kind: "skill", ts: 5 })];
  const b = heartbeatBuckets(beats, 3, 4);
  const filled = b.find((x) => x.count > 0)!;
  expect(filled.kind).toBe("tool"); // 2 tool vs 1 skill
});

test("economyView: humanized in/out, cache% = cacheRead/(cacheRead+cacheCreate+input), web", () => {
  const t = { ...newSessionTokens(), input: 12000, output: 3000, cacheRead: 90000, cacheCreate: 6000, webCalls: 2 };
  const v = economyView(t);
  expect(v.inTok).toBe("12k");
  expect(v.outTok).toBe("3k");
  expect(v.cachePct).toBe(Math.round((90000 / (90000 + 6000 + 12000)) * 100)); // 83
  expect(v.web).toBe(2);
});

test("economyView: zero tokens -> sane zeros", () => {
  const v = economyView(newSessionTokens());
  expect(v).toEqual({ inTok: "0", outTok: "0", cachePct: 0, web: 0 });
});

test("toolTimingView sorts bottleneck-first and derives avg", () => {
  const rows = toolTimingView({
    Read: { count: 4, totalMs: 2000, minMs: 200, maxMs: 900 },
    Bash: { count: 2, totalMs: 9000, minMs: 1000, maxMs: 8000 },
  });
  expect(rows.map((r) => r.name)).toEqual(["Bash", "Read"]);
  expect(rows[0]).toEqual({ name: "Bash", count: 2, avgMs: 4500, minMs: 1000, maxMs: 8000, totalMs: 9000 });
});

test("ctxBreakdownView: residual system pool, clamped at 0, ordered", () => {
  const tokens = { ...newSessionTokens(), contextTokens: 200 };
  const v = ctxBreakdownView(tokens, { user: 20, tools: 100, subagents: 30, reasoning: 10 });
  expect(v.total).toBe(200);
  expect(v.segments.map((s) => s.key)).toEqual(["system", "user", "tools", "subagents", "reasoning"]);
  expect(v.segments[0]).toEqual({ key: "system", label: "sys", tokens: 40, frac: 0.2 }); // 200-160 residual
  const over = ctxBreakdownView({ ...newSessionTokens(), contextTokens: 100 }, { user: 80, tools: 80, subagents: 0, reasoning: 0 });
  expect(over.segments[0]!.tokens).toBe(0); // estimates exceed total → residual clamps
});

test("lensTimeline surfaces error beat timestamps", () => {
  const beats = [beat({ id: "a", ts: 100 }), beat({ id: "b", ts: 200, ok: false }), beat({ id: "c", ts: 300 })];
  expect(lensTimeline(beats, 3).errors).toEqual([{ ts: 200 }]);
});
