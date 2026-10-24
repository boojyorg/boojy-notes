import { useTheme } from "../hooks/useTheme";

/**
 * A formula or a diagram that did not draw: its error after a red dot, and,
 * when the last version that drew is still shown above, a word saying so.
 */
export default function RenderFailure({
  error,
  kept,
  padding,
}: {
  error: string;
  /** The last version that worked is still drawn. */
  kept: boolean;
  padding: string;
}) {
  const { theme } = useTheme();
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 7,
        alignItems: "baseline",
        justifyContent: "center",
        fontSize: 12.5,
        color: theme.TEXT.muted,
        padding,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: theme.SEMANTIC.error,
          flex: "none",
          transform: "translateY(-1px)",
        }}
      />
      {kept ? `Showing the last version that worked. ${error}` : error}
    </div>
  );
}
