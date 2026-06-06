import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutFlow, ROW_STRIDE } from "../../core/flow-layout";
import type { Beat } from "../../core/types";
import { theme } from "../theme";
import { pulseIntensity, lerpHex } from "../anim";

interface Props {
  beats: Beat[]; // presented (paced) beats from the player
  cursor: number; // index of the focused/current beat (history or live head)
  pulse: boolean;
  width: number;
  height: number;
}

const ICON_COL = 6; // x where node icon/label start (after the gutter)
const TAIL = 4; // pulse tail length in cells

// Safe fallback that uses only setCell; we prefer buffer.drawText where possible.
function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Flow({ beats, cursor, pulse, width, height }: Props) {
  const graph = layoutFlow(beats);
  const bg = RGBA.fromHex(theme.bg);
  const dimWire = RGBA.fromHex(theme.wireDim);

  // viewport: center on the cursor, clamped so we never scroll past the ends.
  const total = graph.rows;
  const top = Math.max(0, Math.min(Math.max(0, total - height), cursor * ROW_STRIDE - Math.floor(height / 2)));

  return (
    <box
      style={{ width, height, backgroundColor: theme.bg }}
      buffered
      live={pulse}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.fillRect(0, 0, width, height, bg);
        const now = (globalThis.performance?.now?.() ?? 0) / 120; // pulse head speed
        const span = total + TAIL;
        const headRow = total > 0 ? now % span : 0;

        // connectors (segments) with energy pulse coloring
        for (const seg of graph.segments) {
          const laneCol = graph.lanes.find((l) => l.id === seg.lane)?.column ?? 0;
          const laneColor = theme.laneColors[laneCol % theme.laneColors.length]!;
          for (const c of seg.cells) {
            const y = c.y - top;
            if (y < 0 || y >= height) continue;
            let color = dimWire;
            if (pulse && total > 0) {
              const d = (((headRow - c.y) % span) + span) % span;
              const intensity = pulseIntensity(d, TAIL);
              if (intensity > 0) color = RGBA.fromHex(lerpHex(theme.wireDim, laneColor, intensity));
            }
            const x = ICON_COL - 2 + c.x;
            if (x < 0 || x >= width) continue;
            buffer.setCell(x, y, c.ch, color, bg);
          }
        }

        // nodes (icon + label) — cursor row highlighted
        for (const node of graph.nodes) {
          const y = node.row * ROW_STRIDE - top;
          if (y < 0 || y >= height) continue;
          const b = beats[node.row];
          if (!b) continue;
          const focused = node.row === cursor;
          const labelColor = RGBA.fromHex(
            b.kind === "skill" ? theme.accent : focused ? theme.fg : b.ok === false ? theme.err : theme.fg,
          );
          const iconColor = RGBA.fromHex(theme.laneColors[node.column % theme.laneColors.length]!);
          const x = ICON_COL - 2 + node.column * 2;
          if (x < 0 || x >= width) continue;
          buffer.setCell(x, y, focused ? "◉" : "○", iconColor, bg);
          const text = ` ${b.icon ? b.icon + " " : ""}${b.label}${b.count > 1 ? ` ×${b.count}` : ""}${
            b.detail ? " · " + b.detail : ""
          }`;
          const clipped = text.slice(0, Math.max(0, width - x - 2));
          if (clipped.length > 0) drawStr(buffer, x + 1, y, clipped, labelColor, bg);
        }
      }}
    />
  );
}
