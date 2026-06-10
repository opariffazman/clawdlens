import { realpathSync } from "node:fs";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App";
import { createStore } from "./store/sessionStore";

const store = createStore();
store.start();
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  onDestroy: () => { store.stop(); process.exit(0); },
});
// resolve symlinks so the cwd matches what Claude recorded in the transcript
let cwd = process.cwd();
try { cwd = realpathSync(cwd); } catch {}
createRoot(renderer).render(<App store={store} cwd={cwd} />);
