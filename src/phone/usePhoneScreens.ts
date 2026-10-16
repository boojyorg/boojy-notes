import { useEffect, useRef } from "react";
import { isPhone } from "../utils/platform";
import { backAction, escapeTarget, type LeftAt, resumesOnNote } from "./screens";

const LEFT_KEY = "boojy-phone-left";

/**
 * Android's back and the app leaving the screen, on the phone only.
 *
 * Back is Escape first, as every surface already closes itself on Escape
 * (a menu, search, a dialog); only when none took it does Back move: from the
 * note to Home, and from Home out of the app (to the background, as Android's
 * own Back does, so the app is as it was when it comes back).
 *
 * Leaving notes which screen was showing; a launch soon after, because
 * Android closed the app in the background, puts the note back on screen.
 */
export function usePhoneScreens({
  onNote,
  loaded,
  showHome,
  showNote,
}: {
  onNote: boolean;
  /** The vault has been read, so the restored note is there to show. */
  loaded: boolean;
  showHome: () => void;
  showNote: () => void;
}) {
  const latest = useRef({ onNote, showHome });
  latest.current = { onNote, showHome };

  useEffect(() => {
    if (!isPhone) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      const handle = App.addListener("backButton", () => {
        const esc = new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        });
        escapeTarget(document.activeElement).dispatchEvent(esc);
        if (esc.defaultPrevented) return;
        if (backAction(latest.current.onNote) === "home") {
          (document.activeElement as HTMLElement | null)?.blur?.();
          latest.current.showHome();
        } else {
          App.minimizeApp();
        }
      });
      remove = () => handle.then((h) => h.remove());
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  useEffect(() => {
    if (!isPhone) return;
    const note = () => {
      if (document.visibilityState !== "hidden") return;
      const left: LeftAt = { screen: latest.current.onNote ? "note" : "home", at: Date.now() };
      try {
        localStorage.setItem(LEFT_KEY, JSON.stringify(left));
      } catch {}
    };
    document.addEventListener("visibilitychange", note);
    return () => document.removeEventListener("visibilitychange", note);
  }, []);

  const resumed = useRef(false);
  useEffect(() => {
    if (!isPhone || !loaded || resumed.current) return;
    resumed.current = true;
    let left: LeftAt | null = null;
    try {
      left = JSON.parse(localStorage.getItem(LEFT_KEY) ?? "null");
    } catch {}
    if (resumesOnNote(left, Date.now())) showNote();
  }, [loaded, showNote]);
}
