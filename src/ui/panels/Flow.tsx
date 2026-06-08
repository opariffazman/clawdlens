import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutFlow, ROW_STRIDE } from "../../core/flow-layout";
import type { Beat } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";

interface Props {
  beats: Beat[]; // presented (paced) beats from the player
  cursor: number; // index of the focused/current beat (history or live head)
  animate: boolean;
  lastAdvanceMs: number; // player cadence: when the last beat revealed
  intervalMs: number;    // player cadence: ms until the next reveal (speed-divided)
  width: number;
  height: number;
}

const ICON_COL = 6; // x where node icon/label start (after the gutter)
const TAIL = 7; // comet tail length in cells

// Safe fallback that uses only setCell; we prefer buffer.drawText where possible.
function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Flow({ beats, cursor, animate, lastAdvanceMs, intervalMs, width, height }: Props) {
  const graph = layoutFlow(beats);
  const bg = TRANSPARENT; // cell background stays transparent so the terminal bg shows through
  const dimWire = RGBA.fromHex(theme.wireDim);

  // viewport: center on the newest revealed node (the comet head, cursor-1), clamped to the ends.
  const total = graph.rows;
  const top = Math.max(0, Math.min(Math.max(0, total - height), (cursor - 1) * ROW_STRIDE - Math.floor(height / 2)));

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={animate}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT); // reset to transparent each frame (no ghosting, no forced bg)
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const anchorY = (cursor - 1) * ROW_STRIDE;        // newest revealed node row
        const headY = anchorY - (1 - phase) * ROW_STRIDE; // comet head glides into the node

        // connectors (segments) with comet coloring
        for (const seg of graph.segments) {
          const laneCol = graph.lanes.find((l) => l.id === seg.lane)?.column ?? 0;
          const laneColor = theme.laneColors[laneCol % theme.laneColors.length]!;
          for (const c of seg.cells) {
            const y = c.y - top;
            if (y < 0 || y >= height) continue;
            let color = dimWire;
            if (animate && cursor > 0) {
              color = RGBA.fromHex(cometColor(headY - c.y, TAIL, laneColor, theme.pulseHot, theme.wireDim));
            }
            const x = ICON_COL - 2 + c.x;
            if (x < 0 || x >= width) continue;
            buffer.setCell(x, y, c.ch, color, bg);
          }
        }

        // nodes (icon + label) — the newest revealed node (cursor-1) is the comet head; it breathes
        for (const node of graph.nodes) {
          const y = node.row * ROW_STRIDE - top;
          if (y < 0 || y >= height) continue;
          const b = beats[node.row];
          if (!b) continue;
          const focused = node.row === cursor - 1;
          const labelColor = RGBA.fromHex(
            b.kind === "skill" ? theme.accent : focused ? theme.fg : b.ok === false ? theme.err : theme.fg,
          );
          const laneHex = theme.laneColors[node.column % theme.laneColors.length]!;
          const iconColor = RGBA.fromHex(
            animate && focused ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex,
          );
          const x = ICON_COL - 2 + node.column * 2;
          if (x < 0 || x >= width) continue;
          buffer.setCell(x, y, focused ? "◉" : "○", iconColor, bg);
          const text = ` ${iconFor(b.iconKey)} ${b.label}${b.count > 1 ? ` ×${b.count}` : ""}${
            b.detail ? " · " + b.detail : ""
          }`;
          const clipped = text.slice(0, Math.max(0, width - x - 2));
          if (clipped.length > 0) drawStr(buffer, x + 1, y, clipped, labelColor, bg);
        }
      }}
    />
  );
}
