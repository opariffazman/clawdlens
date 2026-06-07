import type { IconKey } from "../core/types";

export type IconSet = "nerd" | "unicode";

export const ICONS_UNICODE: Record<IconKey, string> = {
  bash: "⚙", edit: "✎", read: "▤", search: "⌕", web: "◍", task: "◆",
  skill: "✦", thinking: "◇", text: "○", todo: "☑", result: "✓", tool: "◈",
};

export const ICONS_NERD: Record<IconKey, string> = {
  bash: "",     // terminal
  edit: "",     // edit (pencil-in-square)
  read: "",     // file-text
  search: "",   // magnifying glass
  web: "",      // globe
  task: "",     // sitemap (subagent fan-out)
  skill: "",    // star
  thinking: "", // lightbulb
  text: "",     // comment
  todo: "",     // tasks / list-check
  result: "",   // check
  tool: "",     // wrench
};

export function activeIconSet(): IconSet {
  return process.env.CL_ICONS === "unicode" ? "unicode" : "nerd";
}
export function usePowerline(): boolean {
  return activeIconSet() === "nerd";
}
export const POWERLINE_RIGHT = ""; // 
export const POWERLINE_LEFT = "";  // 

export function iconFor(key: IconKey): string {
  const set = activeIconSet() === "nerd" ? ICONS_NERD : ICONS_UNICODE;
  return set[key] ?? ICONS_UNICODE[key] ?? "·";
}
