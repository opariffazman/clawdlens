import { openSync, readSync, closeSync, statSync } from "node:fs";

interface FileState { offset: number; carry: string; seededMid: boolean }

export function createTailer() {
  const states = new Map<string, FileState>();

  function read(file: string, opts: { startAtEof?: boolean; tailBytes?: number } = {}): string[] {
    let size = 0;
    try { size = statSync(file).size; } catch { return []; }

    let st = states.get(file);
    if (!st) {
      let offset: number;
      let seededMid = false;
      if (opts.tailBytes !== undefined) {
        const start = Math.max(0, size - opts.tailBytes);
        offset = start;
        seededMid = start > 0;
      } else {
        offset = opts.startAtEof ? size : 0;
      }
      st = { offset, carry: "", seededMid };
      states.set(file, st);
    }
    if (size < st.offset) { st.offset = 0; st.carry = ""; st.seededMid = false; } // truncated/rotated
    if (size === st.offset) return [];

    const len = size - st.offset;
    const buf = Buffer.allocUnsafe(len);
    const fd = openSync(file, "r");
    try { readSync(fd, buf, 0, len, st.offset); } finally { closeSync(fd); }
    st.offset = size;

    const text = st.carry + buf.toString("utf8");
    const parts = text.split("\n");
    st.carry = parts.pop() ?? ""; // last element is incomplete (no trailing newline) or ""
    const lines = parts.filter(l => l.length > 0);

    if (st.seededMid) {
      st.seededMid = false;
      return lines.slice(1); // drop the mid-line partial fragment
    }
    return lines;
  }

  return { read, forget(file: string) { states.delete(file); } };
}
