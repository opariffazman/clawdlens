export type Action =
  | { type: "sess-up" } | { type: "sess-down" } | { type: "jump"; n: number } | { type: "pin" }
  | { type: "panel-next" } | { type: "panel-prev" }
  | { type: "beat-back" } | { type: "beat-fwd" } | { type: "chunk-back" } | { type: "chunk-fwd" }
  | { type: "to-start" } | { type: "to-live" } | { type: "pause" }
  | { type: "speed-up" } | { type: "speed-down" } | { type: "pulse" }
  | { type: "lens" } | { type: "filter" } | { type: "rescan" } | { type: "help" } | { type: "quit" }
  | { type: "replay" } | { type: "loop" };

export interface KeyEvent { name: string; shift?: boolean; ctrl?: boolean }

export function mapKey(key: KeyEvent): Action | null {
  const n = key.name;
  if (n === "R" || (n === "r" && key.shift)) return { type: "replay" };
  if (n === "L" || (n === "l" && key.shift)) return { type: "loop" };
  if (n === "j" || n === "down") return { type: "sess-down" };
  if (n === "k" || n === "up") return { type: "sess-up" };
  if (/^[1-9]$/.test(n)) return { type: "jump", n: parseInt(n, 10) };
  if (n === "return" || n === "enter") return { type: "pin" };
  if (n === "tab") return key.shift ? { type: "panel-prev" } : { type: "panel-next" };
  if (n === "h" || n === "left") return { type: "beat-back" };
  if (n === "l" || n === "right") return { type: "beat-fwd" };
  if (n === "[") return { type: "chunk-back" };
  if (n === "]") return { type: "chunk-fwd" };
  if (n === "g") return { type: "to-start" };
  if (n === "G" || n === "end") return { type: "to-live" };
  if (n === "space") return { type: "pause" };
  if (n === "+" || n === "=") return { type: "speed-up" };
  if (n === "-") return { type: "speed-down" };
  if (n === "p") return { type: "pulse" };
  if (n === "w") return { type: "lens" };
  if (n === "/") return { type: "filter" };
  if (n === "r") return { type: "rescan" };
  if (n === "?") return { type: "help" };
  if (n === "q") return { type: "quit" };
  return null;
}
