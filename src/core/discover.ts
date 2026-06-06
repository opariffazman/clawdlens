import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface FoundSession { id: string; file: string; project: string; mtimeMs: number }

export function projectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

export function discoverSessions(root: string = projectsRoot()): FoundSession[] {
  const out: FoundSession[] = [];
  let dirs: string[];
  try { dirs = readdirSync(root); } catch { return out; }
  for (const d of dirs) {
    const projDir = join(root, d);
    let files: string[];
    try {
      if (!statSync(projDir).isDirectory()) continue;
      files = readdirSync(projDir);
    } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const file = join(projDir, f);
      let mtimeMs = 0;
      try { mtimeMs = statSync(file).mtimeMs; } catch { continue; }
      out.push({ id: f.replace(/\.jsonl$/, ""), file, project: d, mtimeMs });
    }
  }
  return out;
}
