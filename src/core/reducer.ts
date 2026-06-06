import {
  type Entry, type SessionState, type ContentBlock, type Usage,
  newSessionTokens, newLensState,
} from "./types";
import { addUsage, contextTokens, contextLimit, estimateCostUSD } from "./tokens";

function basename(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

export const TOOL_ICONS: Record<string, string> = {
  Bash: "⚙", Edit: "✎", Write: "✎", Read: "",
  Grep: "", Glob: "", WebSearch: "", WebFetch: "",
  Task: "\u{1f916}", Skill: "\u{1f3af}", TodoWrite: "☑", default: "◈",
};
function toolIcon(name: string): string { return TOOL_ICONS[name] ?? TOOL_ICONS.default!; }

function fileOf(input: Record<string, unknown> | undefined): string | undefined {
  const p = input?.file_path ?? input?.path ?? input?.notebook_path;
  return typeof p === "string" ? basename(p) : undefined;
}

function nextBeatId(s: SessionState): string { s.beatSeq += 1; return `${s.id}:${s.beatSeq}`; }

function pushBeat(s: SessionState, b: Omit<import("./types").Beat, "id" | "count">): void {
  s.beats = [...s.beats, { ...b, id: nextBeatId(s), count: 1 }];
}

function laneFor(e: Entry, s: SessionState): string {
  if (e.isSidechain) {
    const link = e.sourceToolUseID;
    if (link && s.openLanes.includes(link)) return link;
    return s.openLanes[s.openLanes.length - 1] ?? "main";
  }
  return "main";
}

function bumpHeat(s: SessionState, name: string, input: Record<string, unknown> | undefined, ts: number): void {
  const f = fileOf(input);
  if (!f) return;
  const cur = s.fileHeat[f] ?? { reads: 0, edits: 0, lastTs: 0 };
  const isEdit = name === "Edit" || name === "Write" || name === "NotebookEdit";
  s.fileHeat = { ...s.fileHeat, [f]: { reads: cur.reads + (isEdit ? 0 : 1), edits: cur.edits + (isEdit ? 1 : 0), lastTs: ts } };
}

function foldTodos(s: SessionState, input: Record<string, unknown> | undefined): void {
  const todos = input?.todos;
  if (Array.isArray(todos)) {
    s.todos = todos.map((t: any) => ({ content: String(t.content ?? ""), status: t.status ?? "pending" }));
  }
}

export function newSession(id: string, file: string): SessionState {
  return {
    id, file,
    title: id.slice(0, 8),
    cwd: "", project: "", gitBranch: "", model: "",
    status: "idle",
    startedTs: 0, lastActivityTs: 0,
    tokens: newSessionTokens(),
    costUSD: 0,
    beats: [],
    toolStats: {},
    fileHeat: {},
    todos: null,
    lens: newLensState(),
    lastPrompt: "",
    parseErrors: 0,
    lastEntryType: "",
    lastStopReason: null,
    lastBlockKind: null,
    pendingTools: {},
    lastErrored: false,
    openLanes: [],
    beatSeq: 0,
  };
}

function tsOf(e: Entry, fallback: number): number {
  if (e.timestamp) {
    const t = Date.parse(e.timestamp);
    if (!Number.isNaN(t)) return t;
  }
  return fallback;
}

export function applyEntry(prev: SessionState, e: Entry, now: number): SessionState {
  const s: SessionState = { ...prev };
  const ts = tsOf(e, now);
  if (s.startedTs === 0) s.startedTs = ts;

  if (e.cwd && !s.cwd) { s.cwd = e.cwd; s.project = basename(e.cwd); }
  if (e.gitBranch) s.gitBranch = e.gitBranch;

  switch (e.type) {
    case "ai-title":
      if (e.aiTitle) s.title = e.aiTitle;
      break;
    case "last-prompt":
      if (e.lastPrompt) {
        s.lastPrompt = e.lastPrompt;
        if (s.title === s.id.slice(0, 8)) s.title = e.lastPrompt.slice(0, 60);
      }
      break;
    case "assistant":
      foldAssistant(s, e, ts);
      break;
    case "user":
      foldUser(s, e, ts);
      break;
  }

  s.lastEntryType = e.type;
  if (e.type === "assistant" || e.type === "user") s.lastActivityTs = ts;
  return s;
}

function foldAssistant(s: SessionState, e: Entry, ts: number) {
  s.lastErrored = false;
  const m = e.message;
  if (!m) return;
  if (m.model) s.model = m.model;
  s.lastStopReason = m.stop_reason ?? null;

  const usage: Usage | undefined = m.usage;
  if (usage) {
    const t = addUsage(
      { input: s.tokens.input, output: s.tokens.output, cacheRead: s.tokens.cacheRead, cacheCreate: s.tokens.cacheCreate },
      usage,
    );
    s.tokens = { ...s.tokens, input: t.input, output: t.output, cacheRead: t.cacheRead, cacheCreate: t.cacheCreate };
    const ctx = contextTokens(usage);
    if (ctx > 0) { s.tokens.contextTokens = ctx; s.tokens.contextPct = ctx / contextLimit(s.model); }
    s.tokens.webCalls += (usage.server_tool_use?.web_search_requests ?? 0) + (usage.server_tool_use?.web_fetch_requests ?? 0);
    s.costUSD = estimateCostUSD(t, s.model);
  }

  const lane = laneFor(e, s);
  const blocks = Array.isArray(m.content) ? m.content : [];
  for (const b of blocks as ContentBlock[]) {
    if (b.type === "thinking") {
      pushBeat(s, { ts, kind: "thinking", icon: "◇", label: "thinking", lane, skill: e.attributionSkill });
      s.lastBlockKind = "thinking";
    } else if (b.type === "text") {
      const text = (b.text ?? "").trim();
      if (text) { pushBeat(s, { ts, kind: "text", icon: "○", label: "says", detail: text.slice(0, 80), lane, skill: e.attributionSkill }); s.lastBlockKind = "text"; }
    } else if (b.type === "tool_use") {
      const name = b.name ?? "Tool";
      s.toolStats = { ...s.toolStats, [name]: (s.toolStats[name] ?? 0) + 1 };
      if (name === "Skill") {
        const skill = String(b.input?.skill ?? "skill");
        pushBeat(s, { ts, kind: "skill", icon: TOOL_ICONS.Skill!, label: skill, lane, toolUseId: b.id, skill });
      } else if (name === "Task") {
        const sub = String(b.input?.subagent_type ?? b.input?.description ?? "subagent");
        pushBeat(s, { ts, kind: "tool", icon: TOOL_ICONS.Task!, label: `Task · ${sub}`, lane, toolUseId: b.id, skill: e.attributionSkill });
        if (b.id) { s.openLanes = [...s.openLanes, b.id]; s.pendingTools = { ...s.pendingTools, [b.id]: s.beats[s.beats.length - 1]!.id }; }
      } else {
        const detail = name === "Bash"
          ? (typeof b.input?.description === "string" ? b.input.description as string : (typeof b.input?.command === "string" ? (b.input.command as string).slice(0, 60) : undefined))
          : fileOf(b.input) ?? (typeof b.input?.query === "string" ? (b.input.query as string).slice(0, 60) : undefined);
        pushBeat(s, { ts, kind: "tool", icon: toolIcon(name), label: name, detail, lane, toolUseId: b.id, skill: e.attributionSkill });
        if (b.id) s.pendingTools = { ...s.pendingTools, [b.id]: s.beats[s.beats.length - 1]!.id };
        bumpHeat(s, name, b.input, ts);
      }
      s.lastBlockKind = "tool_use";
      if (name === "TodoWrite") foldTodos(s, b.input);
    }
  }
}

function foldUser(s: SessionState, e: Entry, ts: number) {
  const blocks = Array.isArray(e.message?.content) ? e.message!.content as ContentBlock[] : [];
  let errored = false;
  for (const b of blocks) {
    if (b.type !== "tool_result") continue;
    const id = b.tool_use_id;
    if (!id) continue;
    const beatId = s.pendingTools[id];
    if (beatId) {
      s.beats = s.beats.map(bt => bt.id === beatId ? { ...bt, ok: !b.is_error } : bt);
      const np = { ...s.pendingTools }; delete np[id]; s.pendingTools = np;
    }
    if (s.openLanes.includes(id)) s.openLanes = s.openLanes.filter(l => l !== id);
    if (b.is_error) errored = true;
  }
  s.lastErrored = errored;
  void ts;
}
