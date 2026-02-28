import { useState, useRef } from "react";
import { BG, TEXT, ACCENT, SEMANTIC } from "../constants/colors";

export default function SettingsModal({ settingsOpen, setSettingsOpen, settingsTab, setSettingsTab, accentColor, fontSize, setFontSize, user, profile, authActions, syncState, lastSynced, storageUsed, storageLimitMB, onSync, isDesktop, notesDir, changeNotesDir }) {
  const loggedIn = !!user;
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState(null); // null | "signin" | "create" | "check-email"
  const [signupEmail, setSignupEmail] = useState("");
  const [resendStatus, setResendStatus] = useState(null); // null | "sent" | "error"

  function resetAuthForm() {
    setAuthMode(null); setAuthError(null);
    setNameInput(""); setEmailInput(""); setPasswordInput("");
    setShowPassword(false);
  }

  async function handleEmailAuth(mode) {
    if (mode === "signup" && !nameInput.trim()) {
      setAuthError("Please enter your name.");
      return;
    }
    if (!emailInput || !passwordInput) {
      setAuthError("Please enter both email and password.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    if (mode === "signup") {
      const { error } = await authActions.signUpWithEmail(emailInput, passwordInput, nameInput.trim());
      setAuthLoading(false);
      if (error) {
        setAuthError(error.message);
      } else {
        setSignupEmail(emailInput);
        setAuthMode("check-email");
        setAuthError(null);
        setAuthLoading(false);
        setNameInput(""); setPasswordInput(""); setShowPassword(false);
      }
    } else {
      const { error } = await authActions.signInWithEmail(emailInput, passwordInput);
      setAuthLoading(false);
      if (error) { setAuthError(error.message); } else { resetAuthForm(); }
    }
  }

  async function handleResend(email) {
    const target = email || signupEmail || user?.email;
    if (!target) return;
    setResendStatus(null);
    const { error } = await authActions.resendVerification(target);
    setResendStatus(error ? "error" : "sent");
  }

  const contentRef = useRef(null);
  const sectionRefs = useRef({});
  const scrollingTo = useRef(false);

  if (!settingsOpen) return null;

  const SidebarIcon = ({ type, color }) => {
    const props = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
    if (type === "profile") return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></svg>;
    if (type === "sync") return <svg {...props}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>;
    if (type === "storage") return <svg {...props}><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/><path d="M21 7H3l2-4h14l2 4z"/><line x1="12" y1="11" x2="12" y2="15"/></svg>;
    if (type === "appearance") return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
    return null;
  };

  const sidebarItems = [
    { id: "profile", label: "Profile" },
    ...(isDesktop ? [{ id: "storage", label: "Storage" }] : []),
    ...(loggedIn ? [{ id: "sync", label: "Sync" }] : []),
    { id: "appearance", label: "Appearance" },
  ];

  const scrollToSection = (id) => {
    setSettingsTab(id);
    const el = sectionRefs.current[id];
    const container = contentRef.current;
    if (el && container) {
      scrollingTo.current = true;
      container.scrollTo({ top: el.offsetTop - 24, behavior: "smooth" });
      setTimeout(() => { scrollingTo.current = false; }, 400);
    }
  };

  const handleScroll = () => {
    if (scrollingTo.current) return;
    const container = contentRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop + 40;
    const ids = sidebarItems.map(item => item.id);
    let active = "profile";
    for (const id of ids) {
      const el = sectionRefs.current[id];
      if (el && el.offsetTop <= scrollTop) active = id;
    }
    setSettingsTab(active);
  };

  const SectionHeader = ({ title }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT.primary, textTransform: "uppercase", letterSpacing: 1.5, whiteSpace: "nowrap" }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: `${ACCENT.primary}33` }} />
    </div>
  );

  const SignInButton = ({ icon, label, onClick }) => {
    const [hovered, setHovered] = useState(false);
    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 280, height: 36, borderRadius: 8,
          background: hovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)"}`,
          color: TEXT.primary, fontSize: 13, fontWeight: 500,
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setSettingsOpen(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 400,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 401,
          width: 640, maxHeight: 480,
          background: "rgba(20,22,35,0.95)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16,
          boxShadow: "0 24px 48px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16, position: "relative",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: TEXT.primary }}>Settings</span>
          <button
            onClick={() => setSettingsOpen(false)}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              width: 32, height: 32, borderRadius: 8,
              background: "none", border: "none",
              color: TEXT.muted, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = TEXT.secondary}
            onMouseLeave={(e) => e.currentTarget.style.color = TEXT.muted}
          >{"\u2715"}</button>
        </div>

        {/* Body: sidebar + content */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Sidebar */}
          <div style={{
            width: 160, flexShrink: 0, padding: "16px 12px",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            {sidebarItems.map(item => {
              const active = settingsTab === item.id;
              return (
                <button key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  style={{
                    height: 36, borderRadius: 8, paddingLeft: 12,
                    display: "flex", alignItems: "center", gap: 10,
                    fontSize: 14, fontWeight: 500,
                    background: active ? "rgba(164,202,206,0.10)" : "transparent",
                    border: "none",
                    color: active ? ACCENT.primary : TEXT.secondary,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      e.currentTarget.style.color = TEXT.primary;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = TEXT.secondary;
                    }
                  }}
                >
                  <span style={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <SidebarIcon type={item.id} color={active ? ACCENT.primary : TEXT.muted} />
                  </span>
                  {item.label}
                </button>
              );
            })}
            {/* Spacer */}
            <div style={{ flex: 1 }} />
            {/* Sidebar footer — branding */}
            <div style={{ padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
              <img src="/assets/boojy-logo.png" alt="Boojy" style={{ height: 12, objectFit: "contain", alignSelf: "flex-start" }} draggable="false" />
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <img src="/assets/boojy-notes-text-N.png" alt="" style={{ height: 12 }} draggable="false" />
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, flexShrink: 0, position: "relative", top: 0.5 }} />
                <img src="/assets/boojy-notes.text-tes.png" alt="" style={{ height: 11 }} draggable="false" />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: TEXT.muted, marginTop: 9 }}>v0.1.0</span>
            </div>
          </div>

          {/* Content area */}
          <div ref={contentRef} onScroll={handleScroll} style={{ flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column" }}>

            {/* --- Profile --- */}
            <div ref={el => sectionRefs.current.profile = el}>
              <SectionHeader title="Profile" />
              {!loggedIn ? (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TEXT.secondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                    </svg>
                    <p style={{ margin: 0, fontSize: 13, color: TEXT.secondary, lineHeight: 1.5 }}>
                      Sign in to sync your notes across all your devices. Free with 100MB of cloud storage.
                    </p>
                  </div>

                  {authMode === "check-email" ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 32, textAlign: "center" }}>
                      {/* Envelope icon */}
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2"/>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                      </svg>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT.primary }}>Check your inbox</p>
                      <p style={{ margin: 0, fontSize: 13, color: TEXT.secondary, lineHeight: 1.5, maxWidth: 260 }}>
                        We sent a verification link to{" "}
                        <span style={{ color: TEXT.primary, fontWeight: 500 }}>{signupEmail}</span>.
                        Click the link to verify your account, then come back and sign in.
                      </p>
                      {/* Resend button */}
                      <button
                        onClick={() => handleResend(signupEmail)}
                        style={{
                          background: "none", border: `1px solid ${BG.divider}`, borderRadius: 8,
                          padding: "6px 16px", fontSize: 12, color: TEXT.secondary, cursor: "pointer",
                          fontFamily: "inherit", marginTop: 4, transition: "border-color 0.15s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = accentColor}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = BG.divider}
                      >{resendStatus === "sent" ? "Sent!" : resendStatus === "error" ? "Failed \u2014 try again" : "Resend email"}</button>
                      {/* Back to sign in */}
                      <button
                        onClick={() => { setAuthMode("signin"); setEmailInput(signupEmail); setResendStatus(null); }}
                        style={{
                          background: "none", border: "none", padding: 0, marginTop: 4,
                          fontSize: 13, color: TEXT.muted, cursor: "pointer", fontFamily: "inherit",
                        }}
                      >{"\u2190"} Back to sign in</button>
                    </div>
                  ) : authMode === "signin" || authMode === "create" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", marginBottom: 32 }}>
                      {/* Back button */}
                      <button
                        onClick={resetAuthForm}
                        style={{
                          background: "none", border: "none", padding: 0, marginBottom: 4,
                          fontSize: 12, color: TEXT.muted, cursor: "pointer", fontFamily: "inherit",
                          alignSelf: "flex-start",
                        }}
                      >{"\u2190"} Back</button>

                      {/* Name input (create only) */}
                      {authMode === "create" && (
                        <input
                          type="text"
                          placeholder="Name"
                          value={nameInput}
                          onChange={(e) => { setNameInput(e.target.value); setAuthError(null); }}
                          style={{
                            width: 280, maxWidth: "100%", boxSizing: "border-box",
                            background: BG.standard, border: `1px solid ${BG.divider}`, borderRadius: 8,
                            padding: "8px 12px", fontSize: 14, color: TEXT.primary, fontFamily: "inherit",
                            outline: "none",
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = accentColor}
                          onBlur={(e) => e.currentTarget.style.borderColor = BG.divider}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const inputs = e.currentTarget.parentElement.querySelectorAll("input");
                              const idx = Array.from(inputs).indexOf(e.currentTarget);
                              if (inputs[idx + 1]) inputs[idx + 1].focus();
                            }
                          }}
                        />
                      )}

                      {/* Email input */}
                      <input
                        type="email"
                        placeholder="Email"
                        value={emailInput}
                        onChange={(e) => { setEmailInput(e.target.value); setAuthError(null); }}
                        style={{
                          width: 280, maxWidth: "100%", boxSizing: "border-box",
                          background: BG.standard, border: `1px solid ${BG.divider}`, borderRadius: 8,
                          padding: "8px 12px", fontSize: 14, color: TEXT.primary, fontFamily: "inherit",
                          outline: "none",
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = accentColor}
                        onBlur={(e) => e.currentTarget.style.borderColor = BG.divider}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const inputs = e.currentTarget.closest("[style]").querySelectorAll("input");
                            const idx = Array.from(inputs).indexOf(e.currentTarget);
                            if (inputs[idx + 1]) inputs[idx + 1].focus();
                          }
                        }}
                      />

                      {/* Password input with show/hide toggle */}
                      <div style={{ position: "relative", width: 280, maxWidth: "100%" }}>
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Password"
                          value={passwordInput}
                          onChange={(e) => { setPasswordInput(e.target.value); setAuthError(null); }}
                          style={{
                            width: "100%", boxSizing: "border-box",
                            background: BG.standard, border: `1px solid ${BG.divider}`, borderRadius: 8,
                            padding: "8px 36px 8px 12px", fontSize: 14, color: TEXT.primary, fontFamily: "inherit",
                            outline: "none",
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = accentColor}
                          onBlur={(e) => e.currentTarget.style.borderColor = BG.divider}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleEmailAuth(authMode === "create" ? "signup" : "signin");
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{
                            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                            background: "none", border: "none", padding: 2, cursor: "pointer",
                            display: "flex", alignItems: "center",
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TEXT.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            {showPassword ? (
                              <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                            ) : (
                              <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                            )}
                          </svg>
                        </button>
                      </div>

                      {/* Error message */}
                      {authError && (
                        <p style={{ margin: 0, fontSize: 12, color: SEMANTIC.error, lineHeight: 1.4 }}>{authError}</p>
                      )}

                      {/* Submit button */}
                      <button
                        disabled={authLoading}
                        onClick={() => handleEmailAuth(authMode === "create" ? "signup" : "signin")}
                        style={{
                          padding: "8px 32px", borderRadius: 8, border: "none", marginTop: 4,
                          background: accentColor, color: BG.darkest, fontSize: 13, fontWeight: 600,
                          fontFamily: "inherit", cursor: authLoading ? "wait" : "pointer",
                          opacity: authLoading ? 0.6 : 1, transition: "opacity 0.15s",
                        }}
                      >{authLoading ? "..." : authMode === "create" ? "Create Account" : "Sign In"}</button>

                      {/* Switch between sign in / create */}
                      <p style={{ margin: 0, fontSize: 13, color: TEXT.secondary, textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>
                        {authMode === "signin" ? (
                          <>Don't have an account?{" "}
                            <button
                              onClick={() => { setAuthMode("create"); setAuthError(null); }}
                              style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: accentColor, cursor: "pointer", fontFamily: "inherit" }}
                            >Create one</button>
                          </>
                        ) : (
                          <>Already have an account?{" "}
                            <button
                              onClick={() => { setAuthMode("signin"); setAuthError(null); }}
                              style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: accentColor, cursor: "pointer", fontFamily: "inherit" }}
                            >Sign in</button>
                          </>
                        )}
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", marginBottom: 32 }}>
                      <SignInButton
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TEXT.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>}
                        label="Continue with Email"
                        onClick={() => setAuthMode("signin")}
                      />
                      <SignInButton
                        icon={<svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
                        label="Continue with Google"
                        onClick={() => authActions.signInWithOAuth("google")}
                      />
                      <SignInButton
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill={TEXT.primary}><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.14 4.41-3.74 4.25z"/></svg>}
                        label="Continue with Apple"
                        onClick={() => authActions.signInWithOAuth("apple")}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div style={{ marginBottom: 32 }}>
                  {/* Name row */}
                  {(user?.user_metadata?.display_name || user?.user_metadata?.full_name) && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                      <span style={{ fontSize: 13, color: TEXT.muted }}>Name</span>
                      <span style={{ fontSize: 14, color: TEXT.primary }}>{user.user_metadata.display_name || user.user_metadata.full_name?.split(" ")[0]}</span>
                    </div>
                  )}
                  {/* Email row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 13, color: TEXT.muted }}>Email</span>
                    <span style={{ fontSize: 14, color: TEXT.primary }}>{user?.email}</span>
                  </div>
                  {/* Plan row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 13, color: TEXT.muted }}>Plan</span>
                    <span style={{ fontSize: 14, color: TEXT.primary }}>{profile?.tier === 'orbit' ? 'Orbit' : 'Free'}</span>
                  </div>
                  {/* Upgrade link — only show for free users */}
                  {(!profile || profile.tier !== 'orbit') && (
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 0 12px" }}>
                    <a
                      href="https://boojy.org/cloud"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, color: accentColor, textDecoration: "none" }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                      onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                    >Upgrade to Orbit {"\u2197"}</a>
                  </div>
                  )}
                  {/* Sign out */}
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                    <button
                      onClick={() => authActions.signOut()}
                      style={{
                        padding: "8px 32px", borderRadius: 8, border: "none",
                        background: accentColor, color: BG.darkest,
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                        fontFamily: "inherit", transition: "opacity 0.15s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                    >Sign out</button>
                  </div>
                </div>
              )}
            </div>

            {/* --- Notes folder (desktop only) --- */}
            {isDesktop && (() => {
              const displayPath = notesDir
                ? notesDir.replace(/^\/Users\/[^/]+/, "~").replace(/^C:\\Users\\[^\\]+/, "~")
                : "\u2014";
              const truncated = displayPath.length > 32
                ? "\u2026" + displayPath.slice(-30)
                : displayPath;
              return (
                <div ref={el => sectionRefs.current.storage = el} style={{ marginBottom: 32 }}>
                  <SectionHeader title="Storage" />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 13, color: TEXT.muted }}>Notes folder</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, color: TEXT.secondary, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={notesDir}>{truncated}</span>
                      <button
                        onClick={changeNotesDir}
                        style={{
                          padding: "4px 10px", borderRadius: 6,
                          background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.08)`,
                          color: TEXT.secondary, fontSize: 12, fontWeight: 500,
                          cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                      >Change</button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* --- Sync (logged in only) --- */}
            {loggedIn && (() => {
              const statusLabel = syncState === "syncing" ? "Syncing\u2026" : syncState === "error" ? "Sync error" : syncState === "synced" ? "Synced" : "Idle";
              const dotColor = syncState === "syncing" ? accentColor : syncState === "error" ? SEMANTIC.error : syncState === "synced" ? "#4CAF50" : TEXT.muted;
              const storageMB = (storageUsed / (1024 * 1024)).toFixed(1);
              const storagePct = Math.min(100, (storageUsed / (storageLimitMB * 1024 * 1024)) * 100);
              const timeAgo = lastSynced ? (() => {
                const diff = Date.now() - new Date(lastSynced).getTime();
                if (diff < 60000) return "Just now";
                if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
                if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                return `${Math.floor(diff / 86400000)}d ago`;
              })() : "Never";

              return (
                <div ref={el => sectionRefs.current.sync = el}>
                  <SectionHeader title="Sync" />
                  <p style={{ margin: "0 0 16px", fontSize: 13, color: TEXT.secondary, lineHeight: 1.5 }}>
                    Your notes, synced across all your devices via Boojy Cloud.
                  </p>
                  {/* Status row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 13, color: TEXT.muted }}>Status</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, ...(syncState === "syncing" ? { animation: "syncDotPulse 1.2s ease-in-out infinite" } : {}) }} />
                      <span style={{ fontSize: 14, color: TEXT.primary }}>{statusLabel}</span>
                    </div>
                  </div>
                  {/* Last synced row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 13, color: TEXT.muted }}>Last synced</span>
                    <span style={{ fontSize: 14, color: TEXT.primary }}>{timeAgo}</span>
                  </div>
                  {/* Storage */}
                  <div style={{ marginTop: 12, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: TEXT.muted }}>Storage</span>
                      <span style={{ fontSize: 13, color: TEXT.secondary }}>{storageMB} / {storageLimitMB.toFixed(1)} MB</span>
                    </div>
                    <div style={{ width: "100%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)" }}>
                      <div style={{ width: `${storagePct}%`, height: "100%", borderRadius: 3, background: accentColor, transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                  {/* Sync now button */}
                  <button
                    onClick={onSync}
                    disabled={syncState === "syncing"}
                    style={{
                      width: "100%", padding: "8px 0", borderRadius: 8,
                      background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.08)`,
                      color: syncState === "syncing" ? TEXT.muted : TEXT.secondary,
                      fontSize: 13, fontWeight: 500, cursor: syncState === "syncing" ? "default" : "pointer",
                      fontFamily: "inherit", transition: "all 0.15s", marginBottom: 32,
                    }}
                    onMouseEnter={(e) => { if (syncState !== "syncing") e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  >
                    {syncState === "syncing" ? "Syncing\u2026" : "Sync now"}
                  </button>
                </div>
              );
            })()}

            {/* --- Appearance --- */}
            <div ref={el => sectionRefs.current.appearance = el}>
              <SectionHeader title="Appearance" />
              {/* Font size row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 0" }}>
                <span style={{ fontSize: 13, color: TEXT.muted }}>Font size</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: TEXT.secondary, minWidth: 20, textAlign: "center" }}>{fontSize}</span>
                  <button
                    onClick={() => setFontSize(prev => Math.max(10, prev - 1))}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                      color: TEXT.secondary, fontSize: 15, fontWeight: 500,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s", fontFamily: "inherit",
                    }}
                  >{"\u2212"}</button>
                  <button
                    onClick={() => setFontSize(prev => Math.min(24, prev + 1))}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                      color: TEXT.secondary, fontSize: 15, fontWeight: 500,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s", fontFamily: "inherit",
                    }}
                  >+</button>
                </div>
              </div>

              {/* Spell check row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 2px" }}>
                <span style={{ fontSize: 13, color: TEXT.muted }}>Spell check</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: TEXT.muted, opacity: 0.5, fontStyle: "italic" }}>coming soon</span>
                  <div style={{
                    width: 36, height: 20, borderRadius: 10,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                    position: "relative", cursor: "not-allowed", opacity: 0.4,
                    transition: "background 0.15s",
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: "50%",
                      background: TEXT.muted, position: "absolute",
                      top: 2, left: 2, transition: "left 0.15s",
                    }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Content footer */}
            <div style={{ flex: 1 }} />
            <div style={{ textAlign: "center", padding: "23px 0 16px" }}>
              <span style={{ fontSize: 14, color: TEXT.muted }}>Made by Tyr @ </span>
              <a
                href="https://boojy.org"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 14, color: TEXT.muted, textDecoration: "none" }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
              >boojy.org</a>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
