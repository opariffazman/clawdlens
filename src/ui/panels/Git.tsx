import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutGitGraph } from "../../core/git-graph";
import { ROW_STRIDE } from "../../core/flow-layout";
import type { Commit } from "../../core/types";
import { theme } from "../theme";

const ICON_COL = 4;
const COL_WIDTH = 2;
const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);

function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Git({ commits, width, height }: { commits: Commit[]; width: number; height: number }) {
  if (commits.length === 0) {
    return <text fg={theme.dim}>not a git repo (or no commits)</text>;
  }
  const graph = layoutGitGraph(commits);
  const wireColor = RGBA.fromHex(theme.dim);
  const nodeColor = RGBA.fromHex(theme.accent);
  const refColor = RGBA.fromHex(theme.warn);
  const subjColor = RGBA.fromHex(theme.fg);
  return (
    <box
      style={{ width, height }}
      buffered
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const top = 0; // commits are date-desc; HEAD near the top
        for (const seg of graph.segments) {
          for (const cell of seg.cells) {
            const y = cell.y - top;
            if (y < 0 || y >= height) continue;
            const x = ICON_COL + cell.x;
            if (x < 0 || x >= width) continue;
            buffer.setCell(x, y, cell.ch, wireColor, TRANSPARENT);
          }
        }
        for (const node of graph.nodes) {
          const y = node.row * ROW_STRIDE - top;
          if (y < 0 || y >= height) continue;
          const commit = commits[node.row]!;
          const x = ICON_COL + node.column * COL_WIDTH;
          buffer.setCell(x, y, "●", nodeColor, TRANSPARENT);
          const labelX = ICON_COL + (graph.columns + 1) * COL_WIDTH;
          const refStr = commit.refs.length ? `(${commit.refs.join(", ")}) ` : "";
          drawStr(buffer, labelX, y, commit.shortHash + " ", RGBA.fromHex(theme.ok), TRANSPARENT);
          let cx = labelX + 8;
          if (refStr) { drawStr(buffer, cx, y, refStr, refColor, TRANSPARENT); cx += refStr.length; }
          const subj = commit.subject.slice(0, Math.max(0, width - cx - 1));
          drawStr(buffer, cx, y, subj, subjColor, TRANSPARENT);
        }
      }}
    />
  );
}
