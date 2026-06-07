#!/usr/bin/env bun
import { createStore } from "../src/store/sessionStore";

const store = createStore({ pollMs: 1000 });
const unsub = store.subscribe(() => {
  const lines = store.sessions().map((s) => {
    const ctx = Math.round(s.tokens.contextPct * 100);
    const phase = s.lens.activePhase ? ` [${s.lens.activePhase}]` : "";
    const last = s.beats[s.beats.length - 1];
    const doing = last ? `${last.iconKey} ${last.label}${last.detail ? " · " + last.detail : ""}` : "—";
    return `${s.status.padEnd(8)} ${s.project.padEnd(16)} ctx ${String(ctx).padStart(3)}%  $${s.costUSD.toFixed(2)}${phase}  ${doing}`;
  });
  console.clear();
  console.log("ClawdLens — live sessions\n");
  console.log(lines.join("\n") || "(no sessions yet)");
});

store.start();
process.on("SIGINT", () => { store.stop(); unsub(); process.exit(0); });
