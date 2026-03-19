export default function OnboardingToast({ accentColor, onSignIn, onDismiss }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        background: accentColor,
        color: "#fff",
        padding: "14px 20px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 9999,
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        maxWidth: 380,
        animation: "fadeIn 0.25s ease",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        Your notes are saved locally on this browser. Sign in to sync across devices — free with
        100MB cloud storage.
        <br />
        <button
          onClick={onSignIn}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
            fontSize: 13,
            fontWeight: 600,
            marginTop: 6,
          }}
        >
          Sign in
        </button>
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        {"\u2715"}
      </button>
    </div>
  );
}
