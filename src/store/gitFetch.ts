import { parseGitLog, GIT_LOG_ARGS, GIT_LOG_ARGS_BRANCH } from "../core/git-log";
import type { Commit } from "../core/types";

export function gitLog(cwd: string, allBranches = true): Commit[] {
  if (!cwd) return [];
  try {
    const args = allBranches ? GIT_LOG_ARGS : GIT_LOG_ARGS_BRANCH;
    const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "ignore" });
    if (proc.exitCode !== 0) return [];
    return parseGitLog(proc.stdout.toString());
  } catch {
    return [];
  }
}
