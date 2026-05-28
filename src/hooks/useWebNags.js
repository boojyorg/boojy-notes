import { useState, useEffect, useRef } from "react";
import { isNative } from "../utils/platform";

const realNoteCount = (noteData) =>
  Object.keys(noteData).filter((id) => !noteData[id]._draft).length;

/**
 * Web-only nudges for signed-out users: a gentle onboarding toast after a
 * few notes, then a stronger "your notes live only in this browser" warning
 * once they have several. No-ops on native (Electron), where storage is durable.
 *
 * Returns the toast flags plus their setters (the dismiss/sign-in handlers
 * live in the render tree alongside the localStorage flags they write).
 */
export function useWebNags({ noteData, user }) {
  const [onboardingToast, setOnboardingToast] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState(false);
  const persistenceShownRef = useRef(false);

  // Onboarding toast: show once the user has a few real notes
  useEffect(() => {
    if (isNative) return;
    if (user) return;
    if (realNoteCount(noteData) >= 3 && !localStorage.getItem("boojy-onboarding-dismissed")) {
      setOnboardingToast(true);
    }
  }, [noteData, user]);

  // Auto-dismiss the onboarding toast after 15s
  useEffect(() => {
    if (!onboardingToast) return;
    const t = setTimeout(() => setOnboardingToast(false), 15000);
    return () => clearTimeout(t);
  }, [onboardingToast]);

  // Persistence warning: stronger nudge once they have several notes
  useEffect(() => {
    if (isNative) return;
    if (user) return;
    if (persistenceShownRef.current) return;
    if (
      realNoteCount(noteData) > 5 &&
      localStorage.getItem("boojy-onboarding-dismissed") &&
      !localStorage.getItem("boojy-persistence-warning-dismissed")
    ) {
      setPersistenceWarning(true);
      persistenceShownRef.current = true;
    }
  }, [noteData, user]);

  return { onboardingToast, setOnboardingToast, persistenceWarning, setPersistenceWarning };
}
