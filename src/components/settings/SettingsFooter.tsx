import { version as appVersion } from "../../../package.json";
import { useTheme } from "../../hooks/useTheme";

/** Quiet version line shared by desktop and mobile Settings: the full version
 *  and the product page. */
export default function SettingsFooter() {
  const { theme } = useTheme() as { theme: { TEXT: { muted: string } } };
  const { TEXT } = theme;
  return (
    <div style={{ textAlign: "center", padding: "28px 0 4px", fontSize: 12, color: TEXT.muted }}>
      Boojy Notes v{appVersion} ·{" "}
      <a
        href="https://boojy.org/notes/"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: TEXT.muted, textDecoration: "none" }}
        onMouseEnter={(event) => (event.currentTarget.style.textDecoration = "underline")}
        onMouseLeave={(event) => (event.currentTarget.style.textDecoration = "none")}
      >
        boojy.org/notes
      </a>
    </div>
  );
}
