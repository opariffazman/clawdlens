import type { LensState } from "../core/types";
import { SUPERPOWERS_PHASES } from "../core/lens";
import { theme } from "./theme";

export function PhaseRibbon({ lens }: { lens: LensState }) {
  if (!lens.lensId) return null;
  const phases = SUPERPOWERS_PHASES;
  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      <text fg={theme.dim}>⟢</text>
      {phases.map((p, i) => {
        const active = p === lens.activePhase;
        const done = lens.phaseHistory.some((h) => h.phase === p) && !active;
        const color = active ? theme.accent : done ? theme.ok : theme.dim;
        return (
          <text key={p} fg={color}>{p}{i < phases.length - 1 ? (active ? " ▸" : " ─") : ""}</text>
        );
      })}
    </box>
  );
}
