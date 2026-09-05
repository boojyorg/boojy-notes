import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import { NoteDataProvider, useNoteDataActions } from "./context/NoteDataContext";
import { SettingsProvider } from "./context/SettingsContext";
import { LayoutProvider } from "./context/LayoutContext";
import { SidebarProvider } from "./context/SidebarContext";
import { OverlayProvider } from "./context/OverlayContext";
import ErrorBoundary from "./components/ErrorBoundary";
import BoojyNotes from "./BoojyNotes";
import { installTraceProbes } from "./utils/trace";

// The crash screen promises "your notes have been backed up to local
// storage"; that only happens if the boundary can reach the live note store.
// It sits inside NoteDataProvider, so a one-line wrapper hands it the ref.
function AppErrorBoundary({ children }) {
  const { noteDataRef } = useNoteDataActions();
  return <ErrorBoundary noteDataRef={noteDataRef}>{children}</ErrorBoundary>;
}

// Apply saved UI scale immediately to prevent flash
const savedScale = localStorage.getItem("boojy-ui-scale");
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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <NoteDataProvider>
        <SettingsProvider>
          <LayoutProvider>
            <SidebarProvider>
              <OverlayProvider>
                <AppErrorBoundary>
                  <BoojyNotes />
                </AppErrorBoundary>
              </OverlayProvider>
            </SidebarProvider>
          </LayoutProvider>
        </SettingsProvider>
      </NoteDataProvider>
    </ThemeProvider>
  </StrictMode>,
);
