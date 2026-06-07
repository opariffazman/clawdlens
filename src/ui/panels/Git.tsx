import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutGitGraph } from "../../core/git-graph";
import { ROW_STRIDE } from "../../core/flow-layout";
import type { Commit } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";

const ICON_COL = 4;
const COL_WIDTH = 2;
const TAIL = 7;

function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Git({ commits, width, height, progress, lastAdvanceMs, intervalMs }: { commits: Commit[]; width: number; height: number; progress: number; lastAdvanceMs: number; intervalMs: number }) {
  const total = commits.length;
  if (total === 0) return <text fg={theme.dim}>not a git repo (or no commits)</text>;
  const revealed = Math.max(1, Math.ceil(progress * total)); // synced to the Flow cursor
  const animating = progress < 1;

  // `git log` is date-desc (HEAD first) — the lane algorithm needs that order.
  // We DISPLAY chronologically (oldest at top, HEAD at bottom) like the Flow:
  // flip the y-axis, reveal oldest-first, and follow the building edge.
  const graph = layoutGitGraph(commits);
  const rowsTotal = graph.rows;                 // (total-1)*ROW_STRIDE + 1
  const minIdx = total - revealed;              // date-desc index threshold (>= = revealed/older)
  const minY = minIdx * ROW_STRIDE;             // date-desc y threshold for revealed cells
  const buildingY = rowsTotal - 1 - minY;       // chrono row of the newest revealed commit
  const top = Math.max(0, Math.min(Math.max(0, rowsTotal - height), buildingY - height + 2));

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
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const headY = buildingY - (1 - phase) * ROW_STRIDE; // comet glides into the building edge

        // wires — chronological (oldest top), comet flows downward toward HEAD
        for (const seg of graph.segments) {
          for (const cell of seg.cells) {
            if (cell.y < minY) continue; // not yet revealed (newer)
            const chronoY = rowsTotal - 1 - cell.y;
            const y = chronoY - top;
            if (y < 0 || y >= height) continue;
            const x = ICON_COL + cell.x;
            if (x < 0 || x >= width) continue;
            const laneHex = theme.laneColors[Math.floor(cell.x / COL_WIDTH) % theme.laneColors.length]!;
            // 0.4 floor keeps each branch tinted its own color at rest; comet brightens above it
            const hex = animating
              ? cometColor(headY - chronoY, TAIL, laneHex, theme.pulseHot, theme.wireDim, 0.4)
              : lerpHex(theme.wireDim, laneHex, 0.4);
            buffer.setCell(x, y, cell.ch, RGBA.fromHex(hex), TRANSPARENT);
          }
        }

        // commit nodes + labels — the building edge (newest revealed) breathes
        for (const node of graph.nodes) {
          if (node.row < minIdx) continue; // not revealed (newer than the building edge)
          const chronoY = rowsTotal - 1 - node.row * ROW_STRIDE;
          const y = chronoY - top;
          if (y < 0 || y >= height) continue;
          const commit = commits[node.row]!;
          const x = ICON_COL + node.column * COL_WIDTH;
          const laneHex = theme.laneColors[node.column % theme.laneColors.length]!;
          const isEdge = node.row === minIdx;
          const dotColor = RGBA.fromHex(animating && isEdge ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex);
          buffer.setCell(x, y, isEdge ? "◉" : "●", dotColor, TRANSPARENT);
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
