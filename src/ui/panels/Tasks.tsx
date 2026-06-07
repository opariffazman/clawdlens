import type { TodoItem, LensState } from "../../core/types";
import { SUPERPOWERS_PHASES } from "../../core/lens";
import { theme } from "../theme";
import { gaugeBar, truncate } from "../format";

const MARK = { completed: "✔", in_progress: "▸", pending: "○" } as const;
const COLOR = { completed: theme.ok, in_progress: theme.accent, pending: theme.dim } as const;

// Agnostic task view: shows TodoWrite / reconstructed TaskCreate-TaskUpdate todos
// if present; otherwise falls back to the superpowers workflow phase checklist.
export function Tasks({ todos, lens, height, progress, hideDone }: { todos: TodoItem[] | null; lens: LensState; height: number; progress: number; hideDone: boolean }) {
  const list = todos && hideDone ? todos.filter((t) => t.status !== "completed") : todos;
  if (list && list.length > 0) {
    const done = list.filter((t) => t.status === "completed").length;
    return (
      <box style={{ flexDirection: "column" }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.ok}>{gaugeBar(done / list.length, 12)}</text>
          <text fg={theme.dim}>{`${done}/${list.length}`}</text>
        </box>
        {list.slice(0, Math.min(height - 1, Math.ceil(progress * list.length))).map((t, i) => (
          <box key={i} style={{ flexDirection: "row", gap: 1 }}>
            <text fg={COLOR[t.status]}>{MARK[t.status]}</text>
            <text fg={t.status === "completed" ? theme.dim : theme.fg}>{truncate(t.content, 44)}</text>
          </box>
        ))}
      </box>
    );
  }
  if (lens.lensId) {
    const active = lens.activePhase;
    const seen = new Set(lens.phaseHistory.map((h) => h.phase));
    return (
      <box style={{ flexDirection: "column" }}>
        <text fg={theme.dim}>{`workflow · ${lens.lensId}`}</text>
        {SUPERPOWERS_PHASES.map((p) => {
          const isActive = p === active;
          const isDone = seen.has(p) && !isActive;
          const mark = isActive ? "▸" : isDone ? "✔" : "○";
          const color = isActive ? theme.accent : isDone ? theme.ok : theme.dim;
          return (
            <box key={p} style={{ flexDirection: "row", gap: 1 }}>
              <text fg={color}>{mark}</text>
              <text fg={isActive ? theme.fg : theme.dim}>{p}</text>
            </box>
          );
        })}
      </box>
    );
  }
  return <text fg={theme.dim}>no tasks</text>;
}
