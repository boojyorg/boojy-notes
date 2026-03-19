import { useTheme } from "../../hooks/useTheme";
import { useLayout } from "../../context/LayoutContext";
import { version as appVersion } from "../../../package.json";
import { fontSize, fontWeight } from "../../tokens/typography";
import boojyLogo from "/assets/boojy-logo.png";
import boojyN from "/assets/boojy-notes-text-N.png";
import boojyTes from "/assets/boojy-notes.text-tes.png";

export function BrandingFooter() {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const { accentColor } = useLayout();

  return (
    <div style={{ padding: "24px 0 16px", display: "flex", flexDirection: "column", gap: 3 }}>
      <img
        src={boojyLogo}
        alt="Boojy"
        style={{ height: 36, objectFit: "contain", alignSelf: "flex-start" }}
        draggable="false"
      />
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <img src={boojyN} alt="" style={{ height: 29 }} draggable="false" />
        <div
          style={{
            width: 17,
            height: 17,
            borderRadius: "50%",
            background: accentColor,
            flexShrink: 0,
            position: "relative",
            top: 0.5,
          }}
        />
        <img src={boojyTes} alt="" style={{ height: 26 }} draggable="false" />
      </div>
      <span
        style={{
          fontSize: fontSize.sm,
          fontWeight: fontWeight.medium,
          color: TEXT.muted,
          marginTop: 9,
        }}
      >
        v{appVersion}
      </span>
    </div>
  );
}

export function ContentFooter({ isMobile }) {
  const { theme } = useTheme();
  const { TEXT } = theme;

  return (
    <>
      <div style={{ flex: 1 }} />
      {isMobile && <BrandingFooter />}
      <div style={{ textAlign: "center", padding: "23px 0 16px" }}>
        <span style={{ fontSize: fontSize.lg, color: TEXT.muted }}>Made by Tyr @ </span>
        <a
          href="https://boojy.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: fontSize.lg, color: TEXT.muted, textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          boojy.org
        </a>
      </div>
    </>
  );
}
