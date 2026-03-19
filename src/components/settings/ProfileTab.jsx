import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { useLayout } from "../../context/LayoutContext";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";
import { buttonBase } from "../../styles/buttons";

export default function ProfileTab({
  isMobile,
  syncState,
  lastSynced,
  storageUsed,
  storageLimitMB,
  onSync,
  noteData,
  setActiveNote,
  SectionHeader,
}) {
  const {
    setSettingsOpen,
    user,
    profile,
    signInWithEmail,
    signUpWithEmail,
    signInWithOAuth,
    signOut,
    resendVerification,
  } = useSettings();

  const { accentColor } = useLayout();

  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;

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
    setAuthMode(null);
    setAuthError(null);
    setNameInput("");
    setEmailInput("");
    setPasswordInput("");
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
      const { error } = await signUpWithEmail(emailInput, passwordInput, nameInput.trim());
      setAuthLoading(false);
      if (error) {
        setAuthError(error.message);
      } else {
        setSignupEmail(emailInput);
        setAuthMode("check-email");
        setAuthError(null);
        setAuthLoading(false);
        setNameInput("");
        setPasswordInput("");
        setShowPassword(false);
      }
    } else {
      const { error } = await signInWithEmail(emailInput, passwordInput);
      setAuthLoading(false);
      if (error) {
        setAuthError(error.message);
      } else {
        resetAuthForm();
      }
    }
  }

  async function handleResend(email) {
    const target = email || signupEmail || user?.email;
    if (!target) return;
    setResendStatus(null);
    const { error } = await resendVerification(target);
    setResendStatus(error ? "error" : "sent");
  }

  const SignInButton = ({ icon, label, onClick }) => {
    const [hovered, setHovered] = useState(false);
    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: isMobile ? "100%" : 280,
          height: 36,
          borderRadius: radius.md,
          background: hovered ? theme.overlay(0.08) : theme.overlay(0.05),
          border: `1px solid ${hovered ? theme.overlay(0.12) : theme.overlay(0.08)}`,
          color: TEXT.primary,
          fontSize: fontSize.md,
          fontWeight: fontWeight.medium,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {icon}
        {label}
      </button>
    );
  };

  // Helper functions for sync section
  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };
  const formatMB = (mb) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <>
      {/* --- Profile --- */}
      <div>
        <SectionHeader title="Profile" />
        {!loggedIn ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: spacing.md,
                marginBottom: spacing.lg,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={TEXT.secondary}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0, marginTop: 1 }}
              >
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              <p
                style={{ margin: 0, fontSize: fontSize.md, color: TEXT.secondary, lineHeight: 1.5 }}
              >
                Sign in to sync your notes across all your devices. Free with 100MB of cloud
                storage.
              </p>
            </div>

            {authMode === "check-email" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: spacing.md,
                  marginBottom: spacing.xxxl,
                  textAlign: "center",
                }}
              >
                {/* Envelope icon */}
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: fontWeight.semibold,
                    color: TEXT.primary,
                  }}
                >
                  Check your inbox
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: fontSize.md,
                    color: TEXT.secondary,
                    lineHeight: 1.5,
                    maxWidth: 260,
                  }}
                >
                  We sent a verification link to{" "}
                  <span style={{ color: TEXT.primary, fontWeight: 500 }}>{signupEmail}</span>. Click
                  the link to verify your account, then come back and sign in.
                </p>
                {/* Resend button */}
                <button
                  onClick={() => handleResend(signupEmail)}
                  style={{
                    background: "none",
                    border: `1px solid ${BG.divider}`,
                    borderRadius: radius.md,
                    padding: `6px ${spacing.lg}px`,
                    fontSize: fontSize.sm,
                    color: TEXT.secondary,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    marginTop: 4,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = accentColor)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = BG.divider)}
                >
                  {resendStatus === "sent"
                    ? "Sent!"
                    : resendStatus === "error"
                      ? "Failed \u2014 try again"
                      : "Resend email"}
                </button>
                {/* Back to sign in */}
                <button
                  onClick={() => {
                    setAuthMode("signin");
                    setEmailInput(signupEmail);
                    setResendStatus(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    marginTop: 4,
                    fontSize: fontSize.md,
                    color: TEXT.muted,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {"\u2190"} Back to sign in
                </button>
              </div>
            ) : authMode === "signin" || authMode === "create" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: spacing.sm,
                  alignItems: "center",
                  marginBottom: spacing.xxxl,
                }}
              >
                {/* Back button */}
                <button
                  onClick={resetAuthForm}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    marginBottom: 4,
                    fontSize: fontSize.sm,
                    color: TEXT.muted,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    alignSelf: "flex-start",
                  }}
                >
                  {"\u2190"} Back
                </button>

                {/* Name input (create only) */}
                {authMode === "create" && (
                  <input
                    type="text"
                    placeholder="Name"
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      setAuthError(null);
                    }}
                    style={{
                      width: 280,
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      background: BG.standard,
                      border: `1px solid ${BG.divider}`,
                      borderRadius: radius.md,
                      padding: `${spacing.sm}px ${spacing.md}px`,
                      fontSize: fontSize.lg,
                      color: TEXT.primary,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = accentColor)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = BG.divider)}
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
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setAuthError(null);
                  }}
                  style={{
                    width: 280,
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    background: BG.standard,
                    border: `1px solid ${BG.divider}`,
                    borderRadius: radius.md,
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    fontSize: fontSize.lg,
                    color: TEXT.primary,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = accentColor)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = BG.divider)}
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
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setAuthError(null);
                    }}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: BG.standard,
                      border: `1px solid ${BG.divider}`,
                      borderRadius: radius.md,
                      padding: `${spacing.sm}px 36px ${spacing.sm}px ${spacing.md}px`,
                      fontSize: fontSize.lg,
                      color: TEXT.primary,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = accentColor)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = BG.divider)}
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
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      padding: 2,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={TEXT.muted}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>

                {/* Error message */}
                {authError && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: fontSize.sm,
                      color: SEMANTIC.error,
                      lineHeight: 1.4,
                    }}
                  >
                    {authError}
                  </p>
                )}

                {/* Submit button */}
                <button
                  disabled={authLoading}
                  onClick={() => handleEmailAuth(authMode === "create" ? "signup" : "signin")}
                  style={{
                    ...buttonBase,
                    padding: `${spacing.sm}px ${spacing.xxxl}px`,
                    marginTop: spacing.xs,
                    background: accentColor,
                    color: BG.darkest,
                    fontWeight: fontWeight.semibold,
                    cursor: authLoading ? "wait" : "pointer",
                    opacity: authLoading ? 0.6 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {authLoading ? "..." : authMode === "create" ? "Create Account" : "Sign In"}
                </button>

                {/* Switch between sign in / create */}
                <p
                  style={{
                    margin: 0,
                    fontSize: fontSize.md,
                    color: TEXT.secondary,
                    textAlign: "center",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {authMode === "signin" ? (
                    <>
                      Don't have an account?{" "}
                      <button
                        onClick={() => {
                          setAuthMode("create");
                          setAuthError(null);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontSize: fontSize.md,
                          color: accentColor,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Create one
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <button
                        onClick={() => {
                          setAuthMode("signin");
                          setAuthError(null);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontSize: fontSize.md,
                          color: accentColor,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: spacing.sm,
                  alignItems: "center",
                  marginBottom: spacing.xxxl,
                }}
              >
                <SignInButton
                  icon={
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={TEXT.primary}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  }
                  label="Continue with Email"
                  onClick={() => setAuthMode("signin")}
                />
                <SignInButton
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                  }
                  label="Continue with Google"
                  onClick={() => signInWithOAuth("google")}
                />
                <SignInButton
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={TEXT.primary}>
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.14 4.41-3.74 4.25z" />
                    </svg>
                  }
                  label="Continue with Apple"
                  onClick={() => signInWithOAuth("apple")}
                />
              </div>
            )}
          </>
        ) : (
          <div style={{ marginBottom: spacing.xxxl }}>
            {/* Name row */}
            {(user?.user_metadata?.display_name || user?.user_metadata?.full_name) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${spacing.xs}px 0`,
                }}
              >
                <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Name</span>
                <span style={{ fontSize: fontSize.lg, color: TEXT.primary }}>
                  {user.user_metadata.display_name || user.user_metadata.full_name?.split(" ")[0]}
                </span>
              </div>
            )}
            {/* Email row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `${spacing.xs}px 0`,
              }}
            >
              <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Email</span>
              <span style={{ fontSize: fontSize.lg, color: TEXT.primary }}>{user?.email}</span>
            </div>
            {/* Plan row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `${spacing.xs}px 0`,
              }}
            >
              <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Plan</span>
              <span style={{ fontSize: fontSize.lg, color: TEXT.primary }}>
                {profile?.tier === "orbit" ? "Orbit" : "Free"}
              </span>
            </div>
            {/* Upgrade link — only show for free users */}
            {(!profile || profile.tier !== "orbit") && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "12px 0 12px",
                }}
              >
                <a
                  href="https://boojy.org/cloud"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: fontSize.md, color: accentColor, textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  Upgrade to Orbit {"\u2197"}
                </a>
              </div>
            )}
            {/* Sign out */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: spacing.sm }}>
              <button
                onClick={() => signOut()}
                style={{
                  ...buttonBase,
                  padding: `${spacing.sm}px ${spacing.xxxl}px`,
                  background: accentColor,
                  color: BG.darkest,
                  fontWeight: fontWeight.semibold,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Sync (logged in only) --- */}
      {loggedIn &&
        (() => {
          const statusLabel =
            syncState === "syncing"
              ? "Syncing\u2026"
              : syncState === "error"
                ? "Sync error"
                : syncState === "conflict"
                  ? "Conflict detected"
                  : syncState === "offline"
                    ? "Offline"
                    : syncState === "synced"
                      ? "Synced"
                      : "Idle";
          const dotColor =
            syncState === "syncing"
              ? accentColor
              : syncState === "error"
                ? SEMANTIC.error
                : syncState === "conflict"
                  ? "#f59e0b"
                  : syncState === "offline"
                    ? "#9ca3af"
                    : syncState === "synced"
                      ? "#4CAF50"
                      : TEXT.muted;
          const conflictNotes = noteData
            ? Object.values(noteData).filter((n) => n.title && n.title.includes("(conflict "))
            : [];
          const storageLabel = formatBytes(storageUsed);
          const limitLabel = storageLimitMB ? formatMB(storageLimitMB) : "\u2014";
          const storagePct = storageLimitMB
            ? Math.min(100, (storageUsed / (storageLimitMB * 1024 * 1024)) * 100)
            : 0;
          const timeAgo = lastSynced
            ? (() => {
                const diff = Date.now() - new Date(lastSynced).getTime();
                if (diff < 60000) return "Just now";
                if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
                if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                return `${Math.floor(diff / 86400000)}d ago`;
              })()
            : "Never";

          return (
            <div>
              <SectionHeader title="Sync" />
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: fontSize.md,
                  color: TEXT.secondary,
                  lineHeight: 1.5,
                }}
              >
                Your notes, synced across all your devices via Boojy Cloud.
              </p>
              {/* Status row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${spacing.xs}px 0`,
                }}
              >
                <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Status</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: dotColor,
                      ...(syncState === "syncing"
                        ? { animation: "syncDotPulse 1.2s ease-in-out infinite" }
                        : {}),
                    }}
                  />
                  <span style={{ fontSize: fontSize.lg, color: TEXT.primary }}>{statusLabel}</span>
                </div>
              </div>
              {/* Last synced row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${spacing.xs}px 0`,
                }}
              >
                <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Last synced</span>
                <span style={{ fontSize: fontSize.lg, color: TEXT.primary }}>{timeAgo}</span>
              </div>
              {/* Storage */}
              <div style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: fontSize.md, color: TEXT.muted }}>Storage</span>
                  <span style={{ fontSize: fontSize.md, color: TEXT.secondary }}>
                    {storageLabel} / {limitLabel}
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 6,
                    borderRadius: 3,
                    background: theme.overlay(0.05),
                  }}
                >
                  <div
                    style={{
                      width: `${storagePct}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: accentColor,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
              {/* Sync now button */}
              <button
                onClick={onSync}
                disabled={syncState === "syncing"}
                style={{
                  width: "100%",
                  padding: `${spacing.sm}px 0`,
                  borderRadius: radius.md,
                  background: theme.overlay(0.05),
                  border: `1px solid ${theme.overlay(0.08)}`,
                  color: syncState === "syncing" ? TEXT.muted : TEXT.secondary,
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.medium,
                  cursor: syncState === "syncing" ? "default" : "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                  marginBottom: conflictNotes.length > 0 ? 16 : 32,
                }}
                onMouseEnter={(e) => {
                  if (syncState !== "syncing")
                    e.currentTarget.style.background = theme.overlay(0.08);
                }}
                onMouseLeave={(e) => (e.currentTarget.style.background = theme.overlay(0.05))}
              >
                {syncState === "syncing" ? "Syncing\u2026" : "Sync now"}
              </button>

              {/* Conflict copies */}
              {conflictNotes.length > 0 && (
                <div style={{ marginBottom: spacing.xxxl }}>
                  <div
                    style={{
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.semibold,
                      color: "#f59e0b",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {conflictNotes.length} conflict {conflictNotes.length === 1 ? "copy" : "copies"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {conflictNotes.map((note) => (
                      <div
                        key={note.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 10px",
                          borderRadius: radius.default,
                          background: theme.overlay(0.04),
                          border: `1px solid ${theme.overlay(0.06)}`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: fontSize.md,
                            color: TEXT.secondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                            marginRight: spacing.sm,
                          }}
                        >
                          {note.title}
                        </span>
                        <button
                          onClick={() => {
                            setActiveNote(note.id);
                            setSettingsOpen(false);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: accentColor,
                            fontSize: fontSize.sm,
                            fontWeight: fontWeight.medium,
                            cursor: "pointer",
                            padding: `2px ${spacing.sm}px`,
                            borderRadius: radius.sm,
                            fontFamily: "inherit",
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                        >
                          Open
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
    </>
  );
}
