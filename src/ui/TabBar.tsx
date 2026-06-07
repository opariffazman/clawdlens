import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { tabBarCells, tabModel, type TabRole } from "../core/chrome";
import type { PanelId, LensState } from "../core/types";
import { PANELS } from "../core/types";
import { SUPERPOWERS_PHASES } from "../core/lens";
import { theme, TRANSPARENT } from "./theme";

function roleColor(role: TabRole): RGBA {
  // active label + frame border = accent; inactive labels = dim
  return RGBA.fromHex(role === "inactive" ? theme.dim : theme.accent);
}

export function TabBar({ panels, active, lens, width }: { panels: PanelId[]; active: PanelId; lens: LensState; width: number }) {
  return (
    <box
      style={{ width, height: 2, flexShrink: 0, backgroundColor: TRANSPARENT }}
      buffered
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        for (const c of tabBarCells(tabModel(panels, active), width)) {
          buffer.setCell(c.x, c.row, c.ch, roleColor(c.role), TRANSPARENT);
        }
        // phase ribbon on the seam (row 1), right-aligned, never overwriting the corner
        if (lens.lensId) {
          const text = SUPERPOWERS_PHASES.join(" ");
          let x = width - 2 - text.length;
          for (const p of SUPERPOWERS_PHASES) {
            const isActive = p === lens.activePhase;
            const isDone = lens.phaseHistory.some((h) => h.phase === p) && !isActive;
            const color = RGBA.fromHex(isActive ? theme.accent : isDone ? theme.ok : theme.dim);
            if (x > 0 && x < width - 1) buffer.setCell(x, 1, " ", RGBA.fromHex(theme.dim), TRANSPARENT);
            x += 1;
            for (const ch of p) {
              if (x > 0 && x < width - 1) buffer.setCell(x, 1, ch, color, TRANSPARENT);
              x += 1;
            }
          }
        }
      }}
    />
  );
}
