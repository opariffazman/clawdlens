import type { TodoItem } from "../../core/types";
import { theme } from "../theme";
import { gaugeBar, truncate } from "../format";

const MARK = { completed: "✔", in_progress: "▸", pending: "○" } as const;
const COLOR = { completed: theme.ok, in_progress: theme.accent, pending: theme.dim } as const;

export function Todos({ todos, height }: { todos: TodoItem[] | null; height: number }) {
  if (!todos || todos.length === 0) return <text fg={theme.dim}>no todos</text>;
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <box style={{ flexDirection: "column" }}>
      <box style={{ flexDirection: "row", gap: 1 }}>
        <text fg={theme.ok}>{gaugeBar(done / todos.length, 12)}</text>
        <text fg={theme.dim}>{`${done}/${todos.length}`}</text>
      </box>
      {todos.slice(0, height - 1).map((t, i) => (
        <box key={i} style={{ flexDirection: "row", gap: 1 }}>
          <text fg={COLOR[t.status]}>{MARK[t.status]}</text>
          <text fg={t.status === "completed" ? theme.dim : theme.fg}>{truncate(t.content, 40)}</text>
        </box>
      ))}
    </box>
  );
}
