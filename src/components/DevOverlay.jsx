import { useState, useCallback } from "react";
import { useTheme } from "../hooks/useTheme";
import { useLayout } from "../context/LayoutContext";
import { hexToRgb, rgbToHex } from "../utils/colorUtils";

export default function DevOverlay({ open, onClose }) {
  const { theme, themeMode, setThemeMode } = useTheme();
  const {
    accentColor,
    setAccentColor,
    chromeBg,
    setChromeBg,
    editorBg,
    setEditorBg,
    activeTabBg,
    setActiveTabBg,
    tabFlip,
    setTabFlip,
    selectionStyle,
    setSelectionStyle,
    topBarEdge,
    setTopBarEdge,
    createBtnStyle,
    setCreateBtnStyle,
  } = useLayout();

  const [devToast, setDevToast] = useState(null);

  const showDevToast = useCallback((msg) => {
    setDevToast(msg);
    setTimeout(() => setDevToast(null), 1500);
  }, []);

  if (!open) return null;

  const aRgb = hexToRgb(accentColor);
  const cRgb = hexToRgb(chromeBg);
  const eRgb = hexToRgb(editorBg);
  const tRgb = hexToRgb(activeTabBg);
  const sliderCss = `
    .dev-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${theme.TEXT.primary}; cursor: pointer; border: 2px solid ${theme.BG.elevated}; }
    .dev-slider::-webkit-slider-runnable-track { height: 4px; background: ${theme.BG.divider}; border-radius: 2px; }
  `;
  const channels = ["R", "G", "B"];
  const sliderTrack = {
    width: "100%",
    height: 4,
    appearance: "none",
    WebkitAppearance: "none",
    background: theme.BG.divider,
    borderRadius: 2,
    outline: "none",
    cursor: "pointer",
  };
  const rgbSliders = (rgb, setter) =>
    channels.map((ch, i) => (
      <div
        key={ch}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: i < 2 ? 4 : 0,
        }}
      >
        <span
          style={{
            width: 10,
            fontSize: 10,
            color: ch === "R" ? "#E57373" : ch === "G" ? "#81C784" : "#64B5F6",
            fontWeight: 600,
          }}
        >
          {ch}
        </span>
        <input
          className="dev-slider"
          type="range"
          min="0"
          max="255"
          value={rgb[i]}
          style={sliderTrack}
          onChange={(e) => {
            const next = [...rgb];
            next[i] = +e.target.value;
            setter(rgbToHex(...next));
          }}
        />
        <span style={{ width: 24, textAlign: "right", fontSize: 10, color: theme.TEXT.muted }}>
          {rgb[i]}
        </span>
      </div>
    ));

  const btnStyle = (active) => ({
    background: active ? theme.TEXT.primary : "transparent",
    color: active ? theme.BG.darkest : theme.TEXT.muted,
    border: "none",
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.12s, color 0.12s",
  });

  const segmentRow = (label, options, current, onChange) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>{label}</span>
      <div
        style={{
          display: "flex",
          borderRadius: 5,
          overflow: "hidden",
          border: `1px solid ${theme.BG.divider}`,
          marginLeft: "auto",
        }}
      >
        {options.map(({ key, label: lbl }) => (
          <button key={key} onClick={() => onChange(key, lbl)} style={btnStyle(current === key)}>
            {key}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Dev toast */}
      {devToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: theme.BG.elevated,
            border: `1px solid ${theme.BG.divider}`,
            borderRadius: 8,
            padding: "6px 16px",
            fontSize: 12,
            color: theme.TEXT.primary,
            fontWeight: 500,
            zIndex: 200,
            animation: "fadeIn 0.15s ease",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {devToast}
        </div>
      )}

      {/* Dev gear button */}
      <button
        onClick={() => (open ? onClose() : null)}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `1px solid ${theme.BG.divider}`,
          background: open ? theme.BG.surface : `${theme.BG.elevated}aa`,
          color: open ? theme.ACCENT.primary : theme.TEXT.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 201,
          fontSize: 14,
          transition: "background 0.15s, color 0.15s, transform 0.15s",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.color = theme.ACCENT.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.color = open ? theme.ACCENT.primary : theme.TEXT.muted;
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85" />
        </svg>
      </button>

      {/* Dev tools overlay panel */}
      <div
        style={{
          position: "fixed",
          bottom: 52,
          right: 16,
          width: 280,
          background: theme.BG.elevated,
          border: `1px solid ${theme.BG.divider}`,
          borderRadius: 10,
          padding: 16,
          zIndex: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          fontSize: 12,
          color: theme.TEXT.secondary,
          fontFamily: "inherit",
          animation: "slideUp 0.15s ease",
        }}
      >
        <style>{sliderCss}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, color: theme.TEXT.primary, fontSize: 13 }}>
            Dev Tools
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: theme.TEXT.muted,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {segmentRow(
          "Top Bar Edge",
          [
            { key: "A", label: "Shadow+line" },
            { key: "B", label: "Shadow" },
            { key: "C", label: "Line" },
            { key: "D", label: "None" },
          ],
          topBarEdge,
          (key, lbl) => {
            setTopBarEdge(key);
            showDevToast(`Top bar: ${lbl}`);
          },
        )}

        {segmentRow(
          "Create Buttons",
          [
            { key: "A", label: "Default" },
            { key: "B", label: "Ghost" },
            { key: "C", label: "Accent" },
          ],
          createBtnStyle,
          (key, lbl) => {
            setCreateBtnStyle(key);
            showDevToast(`Create btns: ${lbl}`);
          },
        )}

        {segmentRow(
          "Selection",
          [
            { key: "A", label: "Glow bar" },
            { key: "B", label: "Pill" },
          ],
          selectionStyle,
          (key, lbl) => {
            setSelectionStyle(key);
            showDevToast(`Selection: ${lbl}`);
          },
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Theme</span>
          <div
            style={{
              display: "flex",
              borderRadius: 5,
              overflow: "hidden",
              border: `1px solid ${theme.BG.divider}`,
              marginLeft: "auto",
            }}
          >
            {["night", "day", "auto"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setThemeMode(s);
                  showDevToast(`Theme: ${s}`);
                }}
                style={{
                  ...btnStyle(themeMode === s),
                  textTransform: "capitalize",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: theme.BG.divider }} />
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Accent Color</span>
            <code style={{ color: accentColor }}>{accentColor}</code>
          </div>
          {rgbSliders(aRgb, setAccentColor)}
          <div
            style={{
              height: 8,
              marginTop: 6,
              borderRadius: 3,
              background: accentColor,
              border: `1px solid ${theme.BG.divider}`,
            }}
          />
        </div>

        <div style={{ height: 1, background: theme.BG.divider }} />
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span>Active Tab BG</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code style={{ color: theme.TEXT.primary }}>{activeTabBg}</code>
              <button
                onClick={() => {
                  setTabFlip(!tabFlip);
                  showDevToast(`Tab flip: ${!tabFlip ? "ON" : "OFF"}`);
                }}
                style={{
                  background: tabFlip ? theme.TEXT.primary : "transparent",
                  color: tabFlip ? theme.BG.darkest : theme.TEXT.muted,
                  border: `1px solid ${theme.BG.divider}`,
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.12s, color 0.12s",
                }}
              >
                FLIP
              </button>
            </div>
          </div>
          {rgbSliders(tRgb, setActiveTabBg)}
          <div
            style={{
              height: 8,
              marginTop: 6,
              borderRadius: 3,
              background: activeTabBg,
              border: `1px solid ${theme.BG.divider}`,
            }}
          />
        </div>

        <div style={{ height: 1, background: theme.BG.divider }} />
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Chrome BG</span>
            <code style={{ color: theme.TEXT.primary }}>{chromeBg}</code>
          </div>
          {rgbSliders(cRgb, setChromeBg)}
          <div
            style={{
              height: 8,
              marginTop: 6,
              borderRadius: 3,
              background: chromeBg,
              border: `1px solid ${theme.BG.divider}`,
            }}
          />
        </div>

        <div style={{ height: 1, background: theme.BG.divider }} />
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>Editor BG</span>
            <code style={{ color: theme.TEXT.primary }}>{editorBg}</code>
          </div>
          {rgbSliders(eRgb, setEditorBg)}
          <div
            style={{
              height: 8,
              marginTop: 6,
              borderRadius: 3,
              background: editorBg,
              border: `1px solid ${theme.BG.divider}`,
            }}
          />
        </div>

        <div style={{ height: 1, background: theme.BG.divider }} />
        <button
          onClick={() => {
            setChromeBg(theme.BG.dark);
            setEditorBg(theme.BG.editor);
            setAccentColor(theme.ACCENT.primary);
            setActiveTabBg("#1C1C20");
            setTabFlip(false);
          }}
          style={{
            background: "none",
            border: `1px solid ${theme.BG.divider}`,
            borderRadius: 4,
            color: theme.TEXT.muted,
            fontSize: 11,
            padding: "4px 10px",
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          Reset colours
        </button>
      </div>
    </>
  );
}
