import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { tabBarCells, tabModel, type TabRole } from "../core/chrome";
import type { PanelId } from "../core/types";
import { theme, TRANSPARENT } from "./theme";

function roleColor(role: TabRole): RGBA {
  return RGBA.fromHex(role === "inactive" ? theme.dim : theme.accent);
}

export function TabBar({ panels, active, width }: { panels: PanelId[]; active: PanelId; width: number }) {
  return (
    <box
      style={{ width, height: 2, flexShrink: 0, backgroundColor: TRANSPARENT }}
      buffered
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const cells = tabBarCells(tabModel(panels, active), width);
        for (const c of cells) {
          buffer.setCell(c.x, c.row, c.ch, roleColor(c.role), TRANSPARENT);
        }
      }}
    />
  );
}
