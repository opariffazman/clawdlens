import { useEffect, useState } from "react";
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutGitGraph } from "../../core/git-graph";
import { ROW_STRIDE } from "../../core/flow-layout";
import type { Commit } from "../../core/types";
import { theme } from "../theme";
import { pulseIntensity, lerpHex } from "../anim";

const ICON_COL = 4;
const COL_WIDTH = 2;
const TAIL = 4;
const REVEAL_MS = 80; // per-commit reveal cadence
const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);

function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Git({ commits, width, height }: { commits: Commit[]; width: number; height: number }) {
  const total = commits.length;
  const [revealed, setRevealed] = useState(1);

  // restart the build-up whenever the commit set changes (panel reopened / session switched)
  useEffect(() => { setRevealed(1); }, [commits]);
  useEffect(() => {
    if (revealed >= total) return;
    const id = setInterval(() => setRevealed((r) => Math.min(total, r + 1)), REVEAL_MS);
    return () => clearInterval(id);
  }, [revealed, total]);

  if (total === 0) return <text fg={theme.dim}>not a git repo (or no commits)</text>;

  const animating = revealed < total;
  const graph = layoutGitGraph(commits.slice(0, revealed)); // lay out only revealed commits
  const dimWire = RGBA.fromHex(theme.wireDim);
  const nodeColor = RGBA.fromHex(theme.accent);
  const refColor = RGBA.fromHex(theme.warn);
  const subjColor = RGBA.fromHex(theme.fg);
  const hashColor = RGBA.fromHex(theme.ok);

  return (
    <box
      style={{ width, height }}
      buffered
      live={animating}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const span = graph.rows + TAIL;
        const headRow = animating ? ((globalThis.performance?.now?.() ?? 0) / 120) % span : -999;
        // wires (energy pulse while building, dim once settled)
        for (const seg of graph.segments) {
          for (const cell of seg.cells) {
            const y = cell.y;
            if (y < 0 || y >= height) continue;
            const x = ICON_COL + cell.x;
            if (x < 0 || x >= width) continue;
            let color = dimWire;
            if (animating) {
              const d = (((headRow - cell.y) % span) + span) % span;
              const intensity = pulseIntensity(d, TAIL);
              if (intensity > 0) color = RGBA.fromHex(lerpHex(theme.wireDim, theme.accent, intensity));
            }
            buffer.setCell(x, y, cell.ch, color, TRANSPARENT);
          }
        }
        // commit nodes + labels
        for (const node of graph.nodes) {
          const y = node.row * ROW_STRIDE;
          if (y < 0 || y >= height) continue;
          const commit = commits[node.row]!;
          const x = ICON_COL + node.column * COL_WIDTH;
          buffer.setCell(x, y, "●", nodeColor, TRANSPARENT);
          const labelX = ICON_COL + (graph.columns + 1) * COL_WIDTH;
          const refStr = commit.refs.length ? `(${commit.refs.join(", ")}) ` : "";
          drawStr(buffer, labelX, y, commit.shortHash + " ", hashColor, TRANSPARENT);
          let cx = labelX + 8;
          if (refStr) { drawStr(buffer, cx, y, refStr, refColor, TRANSPARENT); cx += refStr.length; }
          const subj = commit.subject.slice(0, Math.max(0, width - cx - 1));
          drawStr(buffer, cx, y, subj, subjColor, TRANSPARENT);
        }
      }}
    />
  );
}
