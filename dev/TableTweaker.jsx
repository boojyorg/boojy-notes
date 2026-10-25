// Dev-only table panel, beside the spacing and motion panels (`?tweak`,
// `pnpm dev:tweak`); never part of a production bundle and, living outside
// src/, never part of the coverage denominator.
//
// Two directions to judge on real notes before either ships:
// - Grow: a table wider than the text column may reach into the margin on
//   its right (Notion's), up to `--col-reach` (EditorArea: the column's right
//   margin and padding) less a gutter that keeps the add-column bar on the page.
// - Header: the header row on a faint neutral ground, mixed from the ink so
//   it suits both themes and is never the accent.
// Both are a stylesheet over the app's own; values persist in localStorage.
import { useEffect, useState } from "react";

const LS_KEY = "boojy-dev-table";
const DEFAULTS = { grow: false, gutter: 32, header: false, tint: 4 };
const STYLE_ID = "boojy-dev-table-style";

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function css(v) {
  return [
    v.grow &&
      `.table-outer { max-width: calc(100% + var(--col-reach, 0px) - ${v.gutter}px) !important; }`,
    v.header &&
      `.table-block thead th { background: color-mix(in srgb, currentColor ${v.tint}%, transparent) !important; }`,
  ]
    .filter(Boolean)
    .join("\n");
}

const panel = {
  position: "fixed",
  left: 548,
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

export default function TableTweaker() {
  const [values, setValues] = useState(load);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css(values);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(values));
    } catch {
      // A private window: the experiment just doesn't survive a reload.
    }
  }, [values]);

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  if (!open) {
    return (
      <button
        type="button"
        style={{ ...btn, position: "fixed", left: 548, bottom: 16, zIndex: 100000 }}
        onClick={() => setOpen(true)}
      >
        Tables
      </button>
    );
  }

  const slider = (key, label, min, max, unit, enabled) => (
    <label style={{ display: "block", marginBottom: 8, opacity: enabled ? 1 : 0.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span>
          {values[key]}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={values[key]}
        disabled={!enabled}
        onChange={(e) => set(key, Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </label>
  );

  return (
    <div style={panel} data-testid="table-tweaker">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <strong style={{ flexGrow: 1 }}>Tables</strong>
        <button type="button" style={btn} onClick={() => setValues({ ...DEFAULTS })}>
          Reset
        </button>
        <button type="button" style={btn} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <label style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          type="checkbox"
          checked={values.grow}
          onChange={(e) => set("grow", e.target.checked)}
        />
        Grow past the text column
      </label>
      {slider("gutter", "Space left at the right", 18, 120, "px", values.grow)}
      <label style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          type="checkbox"
          checked={values.header}
          onChange={(e) => set("header", e.target.checked)}
        />
        Grey header row
      </label>
      {slider("tint", "Grey strength", 1, 12, "%", values.header)}
      <div style={{ color: "#888", marginTop: 4 }}>
        Off is what ships. Try both on a wide window and with the sidebar open.
      </div>
    </div>
  );
}
