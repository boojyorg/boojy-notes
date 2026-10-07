import { version as appVersion } from "../../../package.json";
import { useTheme } from "../../hooks/useTheme";

/** A quiet footer link: muted like the line, underlined on hover. */
function FooterLink({ href, children }: { href: string; children: string }) {
  const { theme } = useTheme();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: theme.TEXT.muted, textDecoration: "none" }}
      onMouseEnter={(event) => (event.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(event) => (event.currentTarget.style.textDecoration = "none")}
    >
      {children}
    </a>
  );
}

/** Settings' quiet version line: the full version, the product page and the privacy policy. */
export default function SettingsFooter() {
  const { theme } = useTheme();
  const { TEXT } = theme;
  return (
    <div style={{ textAlign: "center", padding: "28px 0 4px", fontSize: 12, color: TEXT.muted }}>
      Boojy Notes v{appVersion} ·{" "}
      <FooterLink href="https://boojy.org/notes/">boojy.org/notes</FooterLink> ·{" "}
      <FooterLink href="https://boojy.org/privacy/">Privacy</FooterLink>
    </div>
  );
}
