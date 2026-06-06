import { openSync, readSync, closeSync, statSync } from "node:fs";

interface FileState { offset: number; carry: string }

export function createTailer() {
  const states = new Map<string, FileState>();

  function read(file: string, opts: { startAtEof?: boolean } = {}): string[] {
    let size = 0;
    try { size = statSync(file).size; } catch { return []; }

    let st = states.get(file);
    if (!st) {
      st = { offset: opts.startAtEof ? size : 0, carry: "" };
      states.set(file, st);
    }
    if (size < st.offset) { st.offset = 0; st.carry = ""; } // truncated/rotated
    if (size === st.offset) return [];

    const len = size - st.offset;
    const buf = Buffer.allocUnsafe(len);
    const fd = openSync(file, "r");
    try { readSync(fd, buf, 0, len, st.offset); } finally { closeSync(fd); }
    st.offset = size;

    const text = st.carry + buf.toString("utf8");
    const parts = text.split("\n");
    st.carry = parts.pop() ?? ""; // last element is incomplete (no trailing newline) or ""
    return parts.filter(l => l.length > 0);
  }

  return { read, forget(file: string) { states.delete(file); } };
}
