// Dev-only size panel for the phone, mounted by src/main.jsx instead of the
// desktop panels when a phone dev build is opened with `?tweak`. Never part of
// a production bundle and, living outside src/, never part of the coverage
// denominator.
//
// The note's text goes through `setRhythm`, as RhythmTweaker's does; Home's
// rows and the note's name are laid over with a stylesheet, since their sizes
// are constants. Values persist in localStorage, and every change is logged
// as `[tweak] {...}` (Vite forwards console.error to the dev terminal), so the
// values judged best can be read off and written into the code.
import { useEffect, useState } from "react";
import { PATH_FONT } from "../src/components/NotePath";
import { PHONE_LABEL_SIZE, PHONE_ROW_H } from "../src/constants/layout";
import { DEFAULT_RHYTHM, setRhythm } from "../src/tokens/rhythm";

const LS_KEY = "boojy-dev-phone-sizes";

/** The phone's values in the code: Home's from layout.js, the note's from rhythm.ts and NotePath. */
const NOW = {
  homeText: PHONE_LABEL_SIZE,
  homeRow: PHONE_ROW_H,
  bodySize: DEFAULT_RHYTHM.bodySize,
  lineHeight: DEFAULT_RHYTHM.lineHeight,
  nameSize: PATH_FONT.fontSize,
};

/** Measured against Notion on a Pixel 8a: Home's names ~15% taller than the desktop's, note lines ~1.5. */
const PRESETS = [
  { name: "Now", values: NOW },
  {
    name: "Notion-like",
    values: { ...NOW, homeText: 16, homeRow: 44, lineHeight: 1.5, nameSize: 15 },
  },
];

const CONTROLS = [
  { key: "homeText", label: "Home: name size", min: 13, max: 19, step: 0.5, unit: "px" },
  { key: "homeRow", label: "Home: row height", min: 36, max: 52, step: 1, unit: "px" },
  { key: "bodySize", label: "Note: text size", min: 14, max: 19, step: 0.5, unit: "px" },
  { key: "lineHeight", label: "Note: line spacing", min: 1.3, max: 1.8, step: 0.05, unit: "×" },
  { key: "nameSize", label: "Note: name in header", min: 13, max: 19, step: 0.5, unit: "px" },
];

function load() {
  try {
    return { ...NOW, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") };
  } catch {
    return { ...NOW };
  }
}

const matches = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);

export default function PhoneTweaker() {
  const [values, setValues] = useState(load);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setRhythm({ bodySize: values.bodySize, lineHeight: values.lineHeight });
    let style = document.getElementById("phone-tweak-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "phone-tweak-style";
      document.head.appendChild(style);
    }
    style.textContent = `
      html.is-phone .sidebar-row, html.is-phone .sidebar-section-header {
        font-size: ${values.homeText}px !important;
        height: ${values.homeRow}px !important;
        min-height: ${values.homeRow}px !important;
      }
      html.is-phone [data-title] { font-size: ${values.nameSize}px !important; }
    `;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(values));
    } catch {}
    console.error("[tweak]", JSON.stringify(values));
  }, [values]);

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...pill, bottom: 64 }}>
        Tweak
      </button>
    );
  }
  return (
    <div style={sheet}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setValues({ ...p.values })}
            style={{ ...chip, ...(matches(values, p.values) ? chipOn : null) }}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ ...chip, marginLeft: "auto" }}
        >
          Hide
        </button>
      </div>
      {CONTROLS.map((c) => (
        <label key={c.key} style={{ display: "block", marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{c.label}</span>
            <span>
              {values[c.key]}
              {c.unit}
            </span>
          </div>
          <input
            type="range"
            min={c.min}
            max={c.max}
            step={c.step}
            value={values[c.key]}
            onChange={(e) => set(c.key, Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
      ))}
    </div>
  );
}

const pill = {
  position: "fixed",
  right: 12,
  zIndex: 100000,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid #444",
  background: "#1C1C1C",
  color: "#DDD",
  fontSize: 12,
};
const sheet = {
  position: "fixed",
  left: 8,
  right: 8,
  bottom: 40,
  zIndex: 100000,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #444",
  background: "rgba(28,28,28,0.94)",
  color: "#DDD",
  fontSize: 12,
};
const chip = {
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #555",
  background: "transparent",
  color: "#DDD",
  fontSize: 12,
};
const chipOn = { background: "#2A737D", borderColor: "#2A737D", color: "#fff" };
