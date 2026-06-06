import { useKeyboard, useRenderer } from "@opentui/react";

export function App() {
  const renderer = useRenderer();
  useKeyboard((key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) renderer.destroy();
  });
  return (
    <box style={{ border: true, padding: 1, flexDirection: "column" }}>
      <text fg="#00E5FF">harness-flow</text>
      <text fg="#888">press q to quit</text>
    </box>
  );
}
