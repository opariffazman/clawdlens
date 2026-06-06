import type { Commit } from "./types";

const US = "\x1f"; // unit separator between fields
// commits only, no diffs; %D = ref names; date-order across all refs
export const GIT_LOG_ARGS = [
  "log", "--all", "--date-order", "--no-patch",
  `--pretty=format:%H${US}%P${US}%D${US}%s`, "-n", "120",
];

export function parseGitLog(stdout: string): Commit[] {
  const out: Commit[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(US);
    const hash = parts[0] ?? "";
    if (!hash) continue;
    const parents = (parts[1] ?? "").trim();
    const refs = (parts[2] ?? "").trim();
    out.push({
      hash,
      shortHash: hash.slice(0, 7),
      parents: parents ? parents.split(/\s+/).filter(Boolean) : [],
      refs: refs ? refs.split(",").map((r) => r.trim()).filter(Boolean) : [],
      subject: parts[3] ?? "",
    });
  }
  return out;
}
