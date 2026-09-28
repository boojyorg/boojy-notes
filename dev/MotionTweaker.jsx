// Dev-only motion panel, the spacing panel's twin (`?tweak`, `pnpm dev:tweak`);
// never part of a production bundle and, living outside src/, never part of the
// coverage denominator.
//
// Every value is laid over the `:root` variables tokens/motion.js publishes
// (MOTION_VARS), so a menu opened after a slider moves already wears it. Slow
// motion multiplies the three durations to be watched; it is never copied.
// Values persist in localStorage so a reload keeps the experiment, and "Copy"
// puts the tokens on the clipboard in the shape motion.js holds them.
import { useEffect, useState } from "react";
import {
  MOTION_ENTER_MS,
  MOTION_EXIT_MS,
  MOTION_FAST_MS,
  POP_SCALE_FROM,
  RISE_PX,
} from "../src/tokens/motion";

const LS_KEY = "boojy-dev-motion";
const DEFAULTS = {
  enter: MOTION_ENTER_MS,
  exit: MOTION_EXIT_MS,
  fast: MOTION_FAST_MS,
  popFrom: POP_SCALE_FROM,
  rise: RISE_PX,
  slow: 1,
};
const CONTROLS = [
  { key: "enter", label: "Arrive", min: 40, max: 320, step: 10, unit: "ms" },
  { key: "exit", label: "Leave", min: 30, max: 240, step: 10, unit: "ms" },
  { key: "fast", label: "Hover / press", min: 40, max: 240, step: 10, unit: "ms" },
  { key: "popFrom", label: "Grows from", min: 0.8, max: 1, step: 0.01, unit: "" },
  { key: "rise", label: "Toast lifts", min: 0, max: 20, step: 1, unit: "px" },
  { key: "slow", label: "Slow motion", min: 1, max: 10, step: 1, unit: "×" },
];

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function apply(v) {
  const root = document.documentElement.style;
  root.setProperty("--motion-enter", `${v.enter * v.slow}ms`);
  root.setProperty("--motion-exit", `${v.exit * v.slow}ms`);
  root.setProperty("--motion-fast", `${v.fast * v.slow}ms`);
  root.setProperty("--pop-from", String(v.popFrom));
  root.setProperty("--rise", `${v.rise}px`);
}

const panel = {
  // Beside the spacing panel at the bottom left; the colour panel holds the
  // right edge and the note must stay clear to be judged.
  position: "fixed",
  left: 292,
  bottom: 16,
  width: 240,
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

export default function MotionTweaker() {
  const [values, setValues] = useState(load);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apply(values);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(values));
    } catch {
      // A private window: the experiment just doesn't survive a reload.
    }
  }, [values]);

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const copy = async () => {
    await navigator.clipboard.writeText(
      [
        `export const MOTION_FAST_MS = ${values.fast};`,
        `export const MOTION_ENTER_MS = ${values.enter};`,
        `export const MOTION_EXIT_MS = ${values.exit};`,
        `export const POP_SCALE_FROM = ${values.popFrom};`,
        `export const RISE_PX = ${values.rise};`,
        "",
      ].join("\n"),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  if (!open) {
    return (
      <button
        type="button"
        style={{ ...btn, position: "fixed", left: 292, bottom: 16, zIndex: 100000 }}
        onClick={() => setOpen(true)}
      >
        Motion
      </button>
    );
  }

  return (
    <div style={panel} data-testid="motion-tweaker">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <strong style={{ flexGrow: 1 }}>Motion</strong>
        <button
          type="button"
          style={btn}
          onClick={() => setValues({ ...DEFAULTS })}
          title="Back to motion.js values"
        >
          Reset
        </button>
        <button type="button" style={btn} onClick={copy} title="Copy the tokens for motion.js">
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
            <span style={{ color: values[key] === DEFAULTS[key] ? "#888" : "#9CC9CE" }}>
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
        Open a menu, dialog or toast after moving a slider. Slow motion is never copied. Teal =
        changed from motion.js.
      </div>
    </div>
  );
}
