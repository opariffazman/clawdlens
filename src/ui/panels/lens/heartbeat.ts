import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { Beat } from "../../../core/types";
import { heartbeatBuckets } from "../../../core/lens-bands";
import { theme } from "../../theme";
import { laneHexOf, put, drawStr } from "./draw";

const SPARK = "▁▂▃▄▅▆▇█";
// BeatKind -> a pipeline lane key for coloring
const KIND_KEY: Record<string, string> = { thinking: "think", text: "chat", tool: "tool", skill: "skill", result: "result" };

export function drawHeartbeat(buf: OptimizedBuffer, x: number, y: number, w: number, beats: Beat[], cursor: number, h: number) {
  const label = "beats ";
  const barW = Math.max(1, w - label.length);
  drawStr(buf, x, y, label, RGBA.fromHex(theme.dim), w, h);
  const buckets = heartbeatBuckets(beats, cursor, barW);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  buckets.forEach((b, i) => {
    if (b.count === 0) { put(buf, x + label.length + i, y, "·", RGBA.fromHex(theme.wireDim), w, h); return; }
    const lvl = Math.min(SPARK.length - 1, Math.floor((b.count / max) * (SPARK.length - 1)));
    const hex = laneHexOf(KIND_KEY[b.kind] ?? b.kind);
    put(buf, x + label.length + i, y, SPARK[lvl]!, RGBA.fromHex(hex), w, h);
  });
}
