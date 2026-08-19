import { version as appVersion } from "../../../package.json";
import { useTheme } from "../../hooks/useTheme";
import { fontSize } from "../../tokens/typography";

/** Quiet version and credit line shared by desktop and mobile Settings. */
export default function SettingsFooter() {
  const { theme } = useTheme() as { theme: { TEXT: { muted: string } } };
  const { TEXT } = theme;

  return (
    <div style={{ textAlign: "center", padding: "23px 0 4px" }}>
      <span style={{ fontSize: fontSize.sm, color: TEXT.muted }}>
        Boojy Notes v{appVersion} · Made by Tyr @{" "}
      </span>
      <a
        href="https://boojy.org"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: fontSize.sm, color: TEXT.muted, textDecoration: "none" }}
        onMouseEnter={(event) => (event.currentTarget.style.textDecoration = "underline")}
        onMouseLeave={(event) => (event.currentTarget.style.textDecoration = "none")}
      >
        boojy.org
      </a>
    </div>
  );
}
