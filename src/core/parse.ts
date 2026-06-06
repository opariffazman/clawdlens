import type { Entry } from "./types";

export function parseLine(raw: string): Entry | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object" && typeof obj.type === "string") {
      return obj as Entry;
    }
    return null;
  } catch {
    return null;
  }
}
