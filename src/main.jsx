import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import { NoteDataProvider, useNoteDataActions } from "./context/NoteDataContext";
import { SettingsProvider } from "./context/SettingsContext";
import { LayoutProvider } from "./context/LayoutContext";
import { SidebarProvider } from "./context/SidebarContext";
import ErrorBoundary from "./components/ErrorBoundary";
import BoojyNotes from "./BoojyNotes";
import { installTraceProbes } from "./utils/trace";
import { isPhone } from "./utils/platform";
import { PHONE_UI_SCALE } from "./constants/layout";
import { showStartupFailure } from "./phone/startupFailure";

// The crash screen promises "your notes have been backed up to local
// storage"; that only happens if the boundary can reach the live note store.
// It sits inside NoteDataProvider, so a one-line wrapper hands it the ref.
function AppErrorBoundary({ children }) {
  const { noteDataRef } = useNoteDataActions();
  return <ErrorBoundary noteDataRef={noteDataRef}>{children}</ErrorBoundary>;
}

// `?tweak` on a dev build mounts the colour, spacing and motion panels (dev/, outside
// the coverage denominator; `pnpm dev:tweak` opens the desktop app with it).
// Dead code in a production build.
const tweaking = import.meta.env.DEV && new URLSearchParams(window.location.search).has("tweak");
const ThemeTweaker = tweaking ? lazy(() => import("../dev/ThemeTweaker.jsx")) : null;
const RhythmTweaker = tweaking ? lazy(() => import("../dev/RhythmTweaker.jsx")) : null;
const MotionTweaker = tweaking ? lazy(() => import("../dev/MotionTweaker.jsx")) : null;
// The phone's own panel stands in for the three: they are desktop-wide.
const PhoneTweaker = tweaking && isPhone ? lazy(() => import("../dev/PhoneTweaker.jsx")) : null;

// The phone's own rules in GlobalStyles hang off this class (no hover, touch sizes).
if (isPhone) document.documentElement.classList.add("is-phone");

// Apply saved UI scale immediately to prevent flash
const savedScale =
  localStorage.getItem("boojy-ui-scale") ?? (isPhone ? String(PHONE_UI_SCALE) : null);
if (savedScale && savedScale !== "100") {
  const scale = Number(savedScale);
  document.documentElement.style.zoom = `${scale}%`;
  document.documentElement.style.minHeight = `${10000 / scale}vh`;
}

// Inject CSS Custom Highlight API styles for find-in-note
const highlightStyle = document.createElement("style");
highlightStyle.textContent = `
  ::highlight(find-matches) { background: rgba(255, 200, 0, 0.3); }
  ::highlight(find-active) { background: rgba(255, 150, 0, 0.5); }
`;
document.head.appendChild(highlightStyle);

// Log unhandled promise rejections
window.addEventListener("unhandledrejection", (e) => console.error("[unhandled]", e.reason));
installTraceProbes();

// The phone's vault and sign-in come before the app's first render.
const ready = isPhone ? import("./phone/install").then((m) => m.installPhone()) : Promise.resolve();

ready.then(
  () =>
    createRoot(document.getElementById("root")).render(
      <StrictMode>
        <ThemeProvider>
          <NoteDataProvider>
            <SettingsProvider>
              <LayoutProvider>
                <SidebarProvider>
                  <AppErrorBoundary>
                    <BoojyNotes />
                  </AppErrorBoundary>
                </SidebarProvider>
              </LayoutProvider>
            </SettingsProvider>
          </NoteDataProvider>
          {ThemeTweaker && (
            <Suspense fallback={null}>
              {PhoneTweaker ? (
                <PhoneTweaker />
              ) : (
                <>
                  <ThemeTweaker />
                  <RhythmTweaker />
                  <MotionTweaker />
                </>
              )}
            </Suspense>
          )}
        </ThemeProvider>
      </StrictMode>,
    ),
  (error) => {
    console.error("[startup]", error);
    showStartupFailure(error);
  },
);
