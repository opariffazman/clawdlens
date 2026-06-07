import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { theme, TRANSPARENT } from "./theme";

// Ephemeral k9s-style command prompt: its own bordered box that appears ABOVE the
// panel (on the y-axis) when `:` is pressed and hides on Esc/Enter. A normal flow
// element (height 3) — it pushes the tabs + panel down rather than overlaying them.
// Drawn buffered so the border/content are fully owned; transparent throughout.
export function CommandBox({ query, ghost, width }: { query: string; ghost: string; width: number }) {
  const H = 3;
  return (
    <box
      style={{ width, height: H, flexShrink: 0, backgroundColor: TRANSPARENT }}
      buffered
      renderAfter={(buf: OptimizedBuffer) => {
        buf.clear(TRANSPARENT);
        const acc = RGBA.fromHex(theme.accent);
        const fg = RGBA.fromHex(theme.fg);
        const dim = RGBA.fromHex(theme.dim);
        const W = width;
        if (W < 2) return;
        // rounded border (dynamic accent)
        buf.setCell(0, 0, "╭", acc, TRANSPARENT); buf.setCell(W - 1, 0, "╮", acc, TRANSPARENT);
        buf.setCell(0, 2, "╰", acc, TRANSPARENT); buf.setCell(W - 1, 2, "╯", acc, TRANSPARENT);
        for (let x = 1; x < W - 1; x++) { buf.setCell(x, 0, "─", acc, TRANSPARENT); buf.setCell(x, 2, "─", acc, TRANSPARENT); }
        buf.setCell(0, 1, "│", acc, TRANSPARENT); buf.setCell(W - 1, 1, "│", acc, TRANSPARENT);
        // title on the top border
        const title = " command ";
        for (let i = 0; i < title.length && 2 + i < W - 1; i++) buf.setCell(2 + i, 0, title[i]!, acc, TRANSPARENT);
        // content row:  : <query>▏<ghost>
        let x = 2;
        const put = (s: string, color: RGBA) => { for (const ch of s) { if (x < W - 1) { buf.setCell(x, 1, ch, color, TRANSPARENT); x++; } } };
        put(": ", acc);
        put(query, fg);
        if (x < W - 1) { buf.setCell(x, 1, "▏", acc, TRANSPARENT); x++; }
        put(ghost, dim);
      }}
    />
  );
}
