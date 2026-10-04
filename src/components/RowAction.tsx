import { type ReactNode, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { Tooltip, useTooltip } from "./Tooltip";

/**
 * A small action on a list row (Version History's Restore and Delete,
 * Recently Deleted's Restore and Delete permanently): its glyph muted at
 * rest and in full ink under the pointer, never a box, as the sidebar's ···
 * does. Named by the app's chip with its key, never a native `title`. Not a
 * Tab stop: the list's own keys reach the action.
 */
export default function RowAction({
  label,
  tip,
  shortcut,
  icon,
  onClick,
}: {
  /** The accessible name, which may name the row ("Restore “Lecture 4”"). */
  label: string;
  /** The chip's words, short ("Restore note"). */
  tip: string;
  shortcut?: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  const { theme } = useTheme();
  const tooltip = useTooltip();
  const ref = useRef<HTMLButtonElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseEnter={() => {
          setOver(true);
          tooltip.handlers.onMouseEnter?.();
        }}
        onMouseLeave={() => {
          setOver(false);
          tooltip.handlers.onMouseLeave?.();
        }}
        onMouseDown={tooltip.handlers.onMouseDown}
        style={{
          width: 26,
          height: 24,
          border: "none",
          borderRadius: 6,
          background: "transparent",
          color: over ? theme.TEXT.primary : theme.TEXT.muted,
          transition: "color var(--motion-fast)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {icon}
      </button>
      {tooltip.shown && (
        <Tooltip
          label={tip}
          shortcut={shortcut}
          anchor={ref.current}
          placement="below"
          testId="row-action-tooltip"
        />
      )}
    </>
  );
}
