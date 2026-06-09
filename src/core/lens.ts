import type { SessionState, LensState, Beat } from "./types";

const PHASE_BY_SKILL: { match: RegExp; phase: string }[] = [
  { match: /brainstorming/i, phase: "Brainstorm" },
  { match: /writing-plans/i, phase: "Plan" },
  { match: /(executing-plans|subagent-driven-development|dispatching-parallel-agents)/i, phase: "Execute" },
  { match: /(requesting-code-review|receiving-code-review|code-review)/i, phase: "Review" },
  { match: /(finishing-a-development-branch)/i, phase: "Ship" },
];
export const SUPERPOWERS_PHASES = ["Brainstorm", "Spec", "Plan", "Execute", "Review", "Ship"];

// `b.detail` for file tools holds the basename only (e.g. "x-design.md"),
// so Spec detection matches the "-design.md" suffix, not a path.
function phaseForBeat(b: Beat): string | null {
  const skill = b.skill ?? (b.kind === "skill" ? b.label : undefined);
  if (skill) {
    for (const p of PHASE_BY_SKILL) if (p.match.test(skill)) return p.phase;
    if (/(^|:)pr(-merge)?$/i.test(skill)) return "Ship";
  }
  if (b.kind === "tool" && /Write|Edit/.test(b.label) && /design\.md$/i.test(b.detail ?? "")) return "Spec";
  return null;
}

const SUPERPOWERS_SIGNAL = /superpowers|brainstorm|writing-plans|executing-plans|code-review|subagent-driven|dispatching-parallel/i;

export function detectLensFromBeats(beats: Beat[]): LensState {
  const history: { phase: string; ts: number }[] = [];
  const groups: { skill: string; beatIds: string[]; ts: number }[] = [];
  let active: string | null = null;
  let sawSuperpowers = false;
  let curGroup: { skill: string; beatIds: string[]; ts: number } | null = null;

  for (const b of beats) {
    const skill = b.skill ?? (b.kind === "skill" ? b.label : undefined);
    if (skill) {
      if (SUPERPOWERS_SIGNAL.test(skill)) sawSuperpowers = true;
      if (!curGroup || curGroup.skill !== skill) { curGroup = { skill, beatIds: [], ts: b.ts }; groups.push(curGroup); }
      curGroup.beatIds.push(b.id);
    }
    const phase = phaseForBeat(b);
    if (phase) {
      if (phase === "Spec" || phase === "Plan") sawSuperpowers = true;
      if (phase !== active) { active = phase; history.push({ phase, ts: b.ts }); }
    }
  }
  return {
    lensId: sawSuperpowers ? "superpowers" : null,
    activePhase: sawSuperpowers ? active : null,
    phaseHistory: sawSuperpowers ? history : [],
    skillGroups: groups,
  };
}

export function detectLens(s: SessionState): LensState {
  return detectLensFromBeats(s.beats);
}
