// Dev-only switch for the embed's open arrow (`?tweak`, `pnpm dev:tweak`):
// ↗ or → (GlobalStyles, by `html[data-embed-arrow]`). Never merged; it goes
// with the arrow that loses.
import { useState } from "react";

const KEY = "boojy-dev-embed-arrow";
const LOOKS = [
  { id: "up-right", label: "↗" },
  { id: "right", label: "→" },
];

function read() {
  try {
    return localStorage.getItem(KEY) || "up-right";
  } catch {
    return "up-right";
  }
}

function apply(id) {
  document.documentElement.dataset.embedArrow = id;
}

export default function EmbedTweaker() {
  const [look, setLook] = useState(() => {
    const id = read();
    apply(id);
    return id;
  });
  const choose = (id) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {}
    apply(id);
    setLook(id);
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
      <span style={{ color: "#aaa", padding: "4px 6px" }}>Embed arrow</span>
      {LOOKS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => choose(m.id)}
          style={{
            border: "none",
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
            background: look === m.id ? "#fff" : "transparent",
            color: look === m.id ? "#111" : "#ddd",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
