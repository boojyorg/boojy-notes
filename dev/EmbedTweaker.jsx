// Dev-only switch for the embed look experiment (`?tweak`, `pnpm dev:tweak`):
// the line, a grey ground or a hairline frame (GlobalStyles, by
// `html[data-embed-look]`). Never merged; it goes with the looks that lose.
import { useState } from "react";

const KEY = "boojy-dev-embed-look";
const LOOKS = [
  { id: "line", label: "Line" },
  { id: "ground", label: "Grey ground" },
  { id: "frame", label: "Frame" },
];

function read() {
  try {
    return localStorage.getItem(KEY) || "line";
  } catch {
    return "line";
  }
}

function apply(id) {
  document.documentElement.dataset.embedLook = id;
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
      <span style={{ color: "#aaa", padding: "4px 6px" }}>Embed</span>
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
