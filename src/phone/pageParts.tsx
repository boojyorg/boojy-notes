import { BackIcon } from "../components/Icons";
import { useTheme } from "../hooks/useTheme";

/** What the phone's own pages (Settings, a new location) are made of. */
const BACK = 44;

type Theme = ReturnType<typeof useTheme>["theme"];

/** A row of the page: a glyph, what it says, and room for its chevron. */
export const rowStyle = ({ TEXT, BG }: Theme) =>
  ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    minHeight: 56,
    boxSizing: "border-box",
    padding: "10px 12px 10px 16px",
    border: `1px solid ${BG.divider}`,
    borderRadius: 14,
    background: BG.editor,
    color: TEXT.primary,
    font: "inherit",
    textAlign: "left",
  }) as const;

/** Back, and the page's name centred on its line, as the note's header has it. */
export function PageHead({ title, onBack }: { title: string; onBack: () => void }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${BACK}px 1fr ${BACK}px`,
        alignItems: "center",
        margin: "4px -12px 20px",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        style={{
          width: BACK,
          height: BACK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          background: "transparent",
          color: theme.TEXT.primary,
        }}
      >
        <BackIcon />
      </button>
      <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, textAlign: "center" }}>{title}</h1>
    </div>
  );
}
