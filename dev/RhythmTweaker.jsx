// Dev-only spacing panel, the rhythm's twin of ThemeTweaker. Mounted by
// src/main.jsx beside it when a dev build is opened with `?tweak` (in the
// desktop app: `pnpm dev:tweak`); never part of a production bundle and,
// living outside src/, never part of the coverage denominator.
//
// Every value is laid over tokens/rhythm.ts through `setRhythm`, so the editor
// redraws as a slider moves; values persist in localStorage so a reload keeps
// the experiment, and "Copy" puts DEFAULT_RHYTHM on the clipboard in the shape
// rhythm.ts holds it.
import { useEffect, useState } from "react";
import { DEFAULT_RHYTHM, setRhythm } from "../src/tokens/rhythm";

const LS_KEY = "boojy-dev-rhythm";

const CONTROLS = [
  { key: "bodySize", label: "Body size", min: 14, max: 18, step: 0.5, unit: "px" },
  { key: "lineHeight", label: "Line height", min: 1.4, max: 1.9, step: 0.05, unit: "" },
  { key: "paragraphGap", label: "Paragraph gap", min: 0, max: 24, step: 1, unit: "px" },
  { key: "headingAbove", label: "Above heading (H2)", min: 8, max: 64, step: 2, unit: "px" },
  { key: "headingBelow", label: "Below heading (H2)", min: 0, max: 24, step: 1, unit: "px" },
  { key: "blockGap", label: "Code, table, callout", min: 0, max: 32, step: 1, unit: "px" },
];

function load() {
  try {
    return { ...DEFAULT_RHYTHM, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_RHYTHM };
  }
}

const panel = {
  // Bottom left, over the sidebar: the colour panel holds the right edge, and
  // the note must stay clear to be judged.
  position: "fixed",
  left: 16,
  bottom: 16,
  width: 260,
  zIndex: 100000,
  background: "#1C1C1C",
  color: "#DDDDDD",
  border: "1px solid #444",
  borderRadius: 10,
  padding: 12,
  font: "12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
};
const btn = {
  background: "#2C2C2C",
  color: "#DDDDDD",
  border: "1px solid #444",
  borderRadius: 6,
  padding: "3px 8px",
  font: "inherit",
  cursor: "pointer",
};

export default function RhythmTweaker() {
  const [values, setValues] = useState(load);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRhythm(values);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(values));
    } catch {
      // A private window: the experiment just doesn't survive a reload.
    }
  }, [values]);

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const reset = () => setValues({ ...DEFAULT_RHYTHM });
  const copy = async () => {
    const body = Object.entries(values)
      .map(([k, v]) => `  ${k}: ${v},`)
      .join("\n");
    await navigator.clipboard.writeText(`export const DEFAULT_RHYTHM: Rhythm = {\n${body}\n};\n`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  if (!open) {
    return (
      <button
        type="button"
        style={{ ...btn, position: "fixed", left: 16, bottom: 16, zIndex: 100000 }}
        onClick={() => setOpen(true)}
      >
        Spacing
      </button>
    );
  }

  return (
    <div style={panel} data-testid="rhythm-tweaker">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <strong style={{ flexGrow: 1 }}>Spacing</strong>
        <button type="button" style={btn} onClick={reset} title="Back to rhythm.ts values">
          Reset
        </button>
        <button type="button" style={btn} onClick={copy} title="Copy DEFAULT_RHYTHM for rhythm.ts">
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" style={btn} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      {CONTROLS.map(({ key, label, min, max, step, unit }) => (
        <label key={key} style={{ display: "block", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{label}</span>
            <span style={{ color: values[key] === DEFAULT_RHYTHM[key] ? "#888" : "#9CC9CE" }}>
              {values[key]}
              {unit}
            </span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={values[key]}
            onChange={(e) => set(key, Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
      ))}
      <div style={{ color: "#888", marginTop: 4 }}>
        H1, H3–H6 follow H2. Teal = changed from rhythm.ts.
      </div>
    </div>
  );
}
