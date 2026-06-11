// Raw transcript shapes (subset we use)
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
}

export interface ContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result" | string;
  text?: string;
  thinking?: string;
  name?: string;                 // tool_use
  input?: Record<string, unknown>;
  id?: string;                   // tool_use id
  tool_use_id?: string;          // tool_result -> tool_use id
  is_error?: boolean;
  content?: unknown;
}

export interface Entry {
  type: string;                  // 'assistant' | 'user' | 'ai-title' | 'last-prompt' | 'mode' | ...
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;            // ISO
  cwd?: string;
  gitBranch?: string;
  isSidechain?: boolean | null;
  version?: string;
  attributionSkill?: string;
  attributionPlugin?: string;
  aiTitle?: string;
  lastPrompt?: string;
  sourceToolUseID?: string;
  sourceToolAssistantUUID?: string;
  toolUseResult?: unknown;
  message?: {
    role?: string;
    model?: string;
    stop_reason?: string | null;
    usage?: Usage;
    content?: ContentBlock[] | string;
  };
}

// Derived domain types
export type Status = "running" | "working" | "waiting" | "done" | "idle" | "dormant" | "error";

export type BeatKind = "thinking" | "text" | "tool" | "skill" | "result" | "wait" | "phase";

export type IconKey =
  | "bash" | "edit" | "read" | "search" | "web" | "task" | "skill"
  | "thinking" | "text" | "todo" | "result" | "tool";

export interface BeatSnap {
  cost: number;       // cumulative costUSD as of this beat
  ctxTokens: number;  // context-window occupancy as of this beat
}

export interface Beat {
  id: string;
  ts: number;                    // ms epoch
  kind: BeatKind;
  iconKey: IconKey;
  label: string;
  detail?: string;
  count: number;                 // coalesced count, >= 1
  lane: string;                  // "main" or a subagent lane id (Task tool_use id)
  toolUseId?: string;            // for tool beats, to pair with result
  ok?: boolean;                  // result success (tool beats, after pairing)
  skill?: string;                // attributionSkill if present
  milestone?: "commit" | "branch"; // Bash git commit/branch-create, for Lens bloom/spark
  snap?: BeatSnap;               // cumulative cost/ctx as of this beat (reveal animation)
}

export interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  refs: string[];   // e.g. "HEAD -> main", "origin/main", "tag: v1"
  subject: string;
}

export interface FileHeat {
  reads: number;
  edits: number;
  lastTs: number;
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface SessionTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  contextTokens: number;         // latest-turn context size estimate
  maxContextTokens: number;      // peak context size seen — infers the true window (a 1M run that /compact shrank still reads as 1M)
  contextPct: number;            // contextTokens / model limit (0..1+)
  webCalls: number;
}

export function newSessionTokens(): SessionTokens {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, contextTokens: 0, maxContextTokens: 0, contextPct: 0, webCalls: 0 };
}

export interface CtxPools { user: number; tools: number; subagents: number; reasoning: number }

export interface LensState {
  lensId: string | null;
  activePhase: string | null;
  phaseHistory: { phase: string; ts: number }[];
  skillGroups: { skill: string; beatIds: string[]; ts: number }[];
}

export function newLensState(): LensState {
  return { lensId: null, activePhase: null, phaseHistory: [], skillGroups: [] };
}

// UI panel identity (kept in core so pure chrome helpers can reference it)
export type PanelId = "lens" | "files" | "tasks" | "git" | "log";
export const PANELS: PanelId[] = ["lens", "files", "tasks", "git", "log"];
export const DEFAULT_PANEL: PanelId = "lens";

export interface ToolTiming { count: number; totalMs: number; minMs: number; maxMs: number }

export interface SessionState {
  id: string;
  file: string;
  title: string;
  cwd: string;
  project: string;
  projectDir: string;            // encoded transcript dir name (~/.claude/projects/<this>/) — focus matching, not display
  gitBranch: string;
  model: string;
  status: Status;
  startedTs: number;
  lastActivityTs: number;
  tokens: SessionTokens;
  ctxPools: CtxPools;            // estimated context attribution (system = residual, derived in view)
  costUSD: number;
  beats: Beat[];                 // full history (lazy-paged beyond a cap by the store)
  toolStats: Record<string, number>;
  toolTimings: Record<string, ToolTiming>; // resolved tool_use→tool_result durations per tool name
  fileHeat: Record<string, FileHeat>;
  todos: TodoItem[] | null;
  lens: LensState;
  lastPrompt: string;
  parseErrors: number;

  // internal accumulators (read by status derivation; harmless to expose)
  lastEntryType: string;
  lastStopReason: string | null;
  lastBlockKind: string | null;  // 'thinking' | 'text' | 'tool_use'
  lastSkill: string | null;      // last surfaced skill (Skill tool_use OR attribution) — dedups the skill stage
  pendingTools: Record<string, { beatId: string; name: string; ts: number }>; // tool_use id -> beat + start, awaiting result
  lastErrored: boolean;
  openLanes: string[];           // open subagent lane ids
  beatSeq: number;               // monotonic id source
  tasks: Record<string, TodoItem>; // reconstructed from harness TaskCreate/TaskUpdate, keyed by task id
  taskSeq: number;               // sequential id assigned to each TaskCreate
}
