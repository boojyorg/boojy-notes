// Dev-only switch for where a picked embed's link is edited (`?tweak`,
// `pnpm dev:tweak`): in the corner beside the arrow, or underneath as a
// formula's source (GlobalStyles, by `html[data-embed-edit]`). Never merged;
// it goes with the placement that loses.
import { useState } from "react";

const KEY = "boojy-dev-embed-edit";
const MODES = [
  { id: "corner", label: "Corner" },
  { id: "below", label: "Below (maths)" },
];

function read() {
  try {
    return localStorage.getItem(KEY) || "corner";
  } catch {
    return "corner";
  }
}

function apply(id) {
  document.documentElement.dataset.embedEdit = id;
}

export default function EmbedTweaker() {
  const [mode, setMode] = useState(() => {
    const id = read();
    apply(id);
    return id;
  });
  const choose = (id) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {}
    apply(id);
    setMode(id);
  };
  return (
    <div
      style={{
        position: "fixed",
        top: 52,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100000,
        display: "flex",
        gap: 4,
        padding: 4,
        borderRadius: 8,
        background: "rgba(30,30,30,0.85)",
        font: "12px system-ui",
      }}
    >
      <span style={{ color: "#aaa", padding: "4px 6px" }}>Embed link</span>
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => choose(m.id)}
          style={{
            border: "none",
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
            background: mode === m.id ? "#fff" : "transparent",
            color: mode === m.id ? "#111" : "#ddd",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
