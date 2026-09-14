// Dev-only colour tweaking panel. Mounted by src/main.jsx when a dev build is
// opened with `?tweak`; never part of a production bundle and, living outside
// src/, never part of the coverage denominator.
//
// Every token edited here is laid over the active theme through
// ThemeContext's `setThemeOverrides`, persisted per theme in localStorage so a
// reload keeps the experiment, and "Copy" puts the whole block on the clipboard
// in the exact shape themes.js holds it, for pasting over the theme's tokens.
import { useCallback, useEffect, useMemo, useState } from "react";
import { DAY, NIGHT } from "../src/constants/themes";
import { useTheme } from "../src/hooks/useTheme";

const LS_KEY = "boojy-dev-theme-tweaks";
const EMPTY = {};

const GROUPS = [
  {
    group: "BG",
    keys: ["editor", "standard", "dark", "darkest", "elevated", "surface", "hover", "divider"],
  },
  { group: "TEXT", keys: ["primary", "secondary", "muted"] },
  { group: "ACCENT", keys: ["primary", "text", "onAccent"] },
  { group: null, keys: ["codeBlockBg"] },
];

const pathOf = (group, key) => (group ? `${group}.${key}` : key);
const readPath = (obj, path) => {
  const [g, k] = path.split(".");
  return k ? obj[g][k] : obj[g];
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (r, g, b) =>
  `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const channels = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

function load() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

const panel = {
  position: "fixed",
  right: 16,
  bottom: 16,
  width: 312,
  maxHeight: "85vh",
  overflowY: "auto",
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
  background: "#2E2E2E",
  color: "#EEE",
  border: "1px solid #555",
  borderRadius: 6,
  padding: "3px 8px",
  font: "inherit",
  cursor: "pointer",
};
const row = { display: "flex", alignItems: "center", gap: 6, padding: "2px 0" };
const hexInput = {
  width: 72,
  background: "#111",
  color: "#EEE",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "2px 4px",
  font: "11px ui-monospace, Menlo, monospace",
};

export default function ThemeTweaker() {
  const { theme, setThemeOverrides } = useTheme();
  const name = theme.name;
  const base = name === "day" ? DAY : NIGHT;
  const [all, setAll] = useState(load);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const mine = useMemo(() => all[name] || EMPTY, [all, name]);

  // Push this theme's tweaks into the provider whenever they, or the theme, change.
  useEffect(() => {
    setThemeOverrides(mine);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch {}
  }, [all, mine, setThemeOverrides]);
  useEffect(() => () => setThemeOverrides(null), [setThemeOverrides]);

  const tokenValue = useCallback((path) => mine[path] ?? readPath(base, path), [mine, base]);
  const setToken = useCallback(
    (path, value) =>
      setAll((prev) => ({ ...prev, [name]: { ...(prev[name] || {}), [path]: value } })),
    [name],
  );
  const setMany = useCallback(
    (entries) => setAll((prev) => ({ ...prev, [name]: { ...(prev[name] || {}), ...entries } })),
    [name],
  );
  const reset = useCallback(() => setAll((prev) => ({ ...prev, [name]: {} })), [name]);

  // Warmth: the text tiers as one grey (the G channel) pushed +w on red, -w on blue.
  const warmth = useMemo(() => {
    const [r, g] = channels(tokenValue("TEXT.primary"));
    return r - g;
  }, [tokenValue]);
  const setWarmth = (w) =>
    setMany(
      Object.fromEntries(
        ["primary", "secondary", "muted"].map((k) => {
          const [, g] = channels(tokenValue(`TEXT.${k}`));
          return [`TEXT.${k}`, toHex(g + w, g, g - w)];
        }),
      ),
    );

  const snippet = useMemo(() => {
    const lines = [];
    for (const { group, keys } of GROUPS) {
      if (group) {
        lines.push(`  ${group}: {`);
        for (const k of keys) lines.push(`    ${k}: "${tokenValue(pathOf(group, k))}",`);
        lines.push("  },");
      } else for (const k of keys) lines.push(`  ${k}: "${tokenValue(k)}",`);
    }
    return lines.join("\n");
  }, [tokenValue]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (!open) {
    return (
      <button
        type="button"
        style={{ ...panel, width: "auto", padding: "6px 10px", ...btn }}
        onClick={() => setOpen(true)}
      >
        Tweak {name}
      </button>
    );
  }

  const changed = Object.keys(mine).length;
  return (
    <div style={panel} data-testid="theme-tweaker">
      <div style={{ ...row, justifyContent: "space-between", marginBottom: 6 }}>
        <strong>
          Tweak · {name === "day" ? "Light" : "Dark"}
          {changed ? ` (${changed} changed)` : ""}
        </strong>
        <span style={{ display: "flex", gap: 4 }}>
          <button type="button" style={btn} onClick={reset} title="Back to themes.js values">
            Reset
          </button>
          <button type="button" style={btn} onClick={copy} title="Copy the block for themes.js">
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" style={btn} onClick={() => setOpen(false)}>
            –
          </button>
        </span>
      </div>

      <div style={{ ...row, marginBottom: 6 }}>
        <span style={{ width: 90, color: "#999" }}>Text warmth</span>
        <button type="button" style={btn} onClick={() => setWarmth(warmth - 1)}>
          −
        </button>
        <span style={{ width: 28, textAlign: "center" }}>{warmth > 0 ? `+${warmth}` : warmth}</span>
        <button type="button" style={btn} onClick={() => setWarmth(warmth + 1)}>
          +
        </button>
        <span style={{ color: "#777" }}>R vs B, per tier</span>
      </div>

      {GROUPS.map(({ group, keys }) => (
        <div key={group || "flat"} style={{ marginTop: 6 }}>
          {group && <div style={{ color: "#999", margin: "4px 0 2px" }}>{group}</div>}
          {keys.map((k) => {
            const path = pathOf(group, k);
            const v = tokenValue(path);
            const dirty = path in mine;
            return (
              <label key={path} style={row}>
                <span style={{ width: 90, color: dirty ? "#FFF" : "#BBB" }}>{k}</span>
                <input
                  type="color"
                  value={v}
                  onChange={(e) => setToken(path, e.target.value.toUpperCase())}
                  style={{ width: 28, height: 20, padding: 0, border: "none", background: "none" }}
                />
                <input
                  style={hexInput}
                  value={v}
                  onChange={(e) => {
                    const t = e.target.value.trim();
                    if (HEX.test(t)) setToken(path, t.toUpperCase());
                  }}
                />
                <span style={{ color: "#666" }}>{dirty ? readPath(base, path) : ""}</span>
              </label>
            );
          })}
        </div>
      ))}

      <pre
        style={{
          marginTop: 8,
          padding: 8,
          background: "#111",
          borderRadius: 6,
          font: "10px/1.35 ui-monospace, Menlo, monospace",
          color: "#AAA",
          overflowX: "auto",
        }}
      >
        {snippet}
      </pre>
    </div>
  );
}
