import {
  type Entry, type SessionState, type ContentBlock, type Usage,
  newSessionTokens, newLensState,
} from "./types";
import { addUsage, contextTokens, contextLimit, estimateCostUSD } from "./tokens";

function basename(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
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
  // content blocks handled in Task 7
  void ts;
}

function foldUser(s: SessionState, e: Entry, ts: number) {
  // tool results handled in Task 8
  void s; void e; void ts;
}
