import { type RefObject, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useModalEscape } from "../hooks/useModalEscape";
import { useTheme } from "../hooks/useTheme";
import { NAV_BAR_H, STATUS_BAR_H } from "../utils/uiScale";
import { nameProblem } from "./locations";
import { PageHead, rowStyle } from "./pageParts";

/**
 * Another name for a storage location, over Settings: its name in the app
 * alone, as the desktop's Rename is. Back (and Escape) changes nothing.
 */
export default function RenameLocation({
  name: current,
  taken,
  onRename,
  onClose,
}: {
  /** Its name now. */
  name: string;
  /** The names the other locations show. */
  taken: string[];
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  const pageRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(current);
  const title = "Rename location";
  // A problem is said once Add was tried, not while the name is still being typed.
  const [tried, setTried] = useState(false);
  useFocusTrap(pageRef as RefObject<HTMLElement>, true);
  useModalEscape(true, onClose);
  const problem = nameProblem(name, taken);

  return (
    <form
      ref={pageRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="rename-location"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!problem) onRename(name.trim());
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: `${STATUS_BAR_H} 20px calc(${NAV_BAR_H} + 16px)`,
        background: BG.standard,
        color: TEXT.primary,
        fontSize: 16,
        lineHeight: "24px",
      }}
    >
      <PageHead title={title} onBack={onClose} />
      <label
        htmlFor="location-name"
        style={{ margin: "0 2px 10px", fontSize: 14, fontWeight: 500, color: TEXT.muted }}
      >
        Name
      </label>
      <input
        id="location-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-invalid={tried && problem !== null}
        aria-describedby="location-name-note"
        autoComplete="off"
        style={{ ...rowStyle(theme), outlineOffset: 2 }}
      />
      <p
        id="location-name-note"
        role={tried && problem ? "alert" : undefined}
        style={{
          margin: "10px 2px 0",
          fontSize: 14,
          lineHeight: "20px",
          color: tried && problem ? theme.SEMANTIC.error : TEXT.muted,
        }}
      >
        {(tried && problem) || "Its name in Boojy Notes. Its folder keeps its own name."}
      </p>
      <button
        type="submit"
        style={{
          ...rowStyle(theme),
          marginTop: 28,
          justifyContent: "center",
          fontWeight: 600,
        }}
      >
        Rename
      </button>
    </form>
  );
}
