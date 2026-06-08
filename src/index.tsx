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
createRoot(renderer).render(<App store={store} />);
