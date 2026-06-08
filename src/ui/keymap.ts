export type Action =
  | { type: "panel-next" } | { type: "panel-prev" }
  | { type: "beat-back" } | { type: "beat-fwd" }
  | { type: "speed-up" } | { type: "speed-down" }
  | { type: "pause" } | { type: "replay" }
  | { type: "info" } | { type: "help" } | { type: "quit" };

export interface KeyEvent { name: string; shift?: boolean; ctrl?: boolean }

export function mapKey(key: KeyEvent): Action | null {
  const n = key.name;
  if (n === "tab") return key.shift ? { type: "panel-prev" } : { type: "panel-next" };
  if (n === "up") return { type: "beat-back" };
  if (n === "down") return { type: "beat-fwd" };
  if (n === "left") return { type: "speed-down" };
  if (n === "right") return { type: "speed-up" };
  if (n === "space") return { type: "pause" };
  if (n === "r") return { type: "replay" };
  if (n === "i") return { type: "info" };
  if (n === "?") return { type: "help" };
  if (n === "q") return { type: "quit" };
  return null;
}
