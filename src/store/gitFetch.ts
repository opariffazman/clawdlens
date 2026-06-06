import { parseGitLog, GIT_LOG_ARGS } from "../core/git-log";
import type { Commit } from "../core/types";

export function gitLog(cwd: string): Commit[] {
  if (!cwd) return [];
  try {
    const proc = Bun.spawnSync(["git", ...GIT_LOG_ARGS], { cwd, stdout: "pipe", stderr: "ignore" });
    if (proc.exitCode !== 0) return [];
    return parseGitLog(proc.stdout.toString());
  } catch {
    return [];
  }
}
