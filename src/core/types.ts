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
export type Status = "running" | "working" | "waiting" | "idle" | "dormant" | "error";

export type BeatKind = "thinking" | "text" | "tool" | "skill" | "result" | "wait" | "phase";

export type IconKey =
  | "bash" | "edit" | "read" | "search" | "web" | "task" | "skill"
  | "thinking" | "text" | "todo" | "result" | "tool";

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
  contextPct: number;            // contextTokens / model limit (0..1+)
  webCalls: number;
}

export function newSessionTokens(): SessionTokens {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, contextTokens: 0, contextPct: 0, webCalls: 0 };
}

export interface LensState {
  lensId: string | null;
  activePhase: string | null;
  phaseHistory: { phase: string; ts: number }[];
  skillGroups: { skill: string; beatIds: string[]; ts: number }[];
}

export function newLensState(): LensState {
  return { lensId: null, activePhase: null, phaseHistory: [], skillGroups: [] };
}

export interface SessionState {
  id: string;
  file: string;
  title: string;
  cwd: string;
  project: string;
  gitBranch: string;
  model: string;
  status: Status;
  startedTs: number;
  lastActivityTs: number;
  tokens: SessionTokens;
  costUSD: number;
  beats: Beat[];                 // full history (lazy-paged beyond a cap by the store)
  toolStats: Record<string, number>;
  fileHeat: Record<string, FileHeat>;
  todos: TodoItem[] | null;
  lens: LensState;
  lastPrompt: string;
  parseErrors: number;

  // internal accumulators (read by status derivation; harmless to expose)
  lastEntryType: string;
  lastStopReason: string | null;
  lastBlockKind: string | null;  // 'thinking' | 'text' | 'tool_use'
  pendingTools: Record<string, string>; // tool_use id -> beat id awaiting result
  lastErrored: boolean;
  openLanes: string[];           // open subagent lane ids
  beatSeq: number;               // monotonic id source
}
