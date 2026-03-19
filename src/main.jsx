import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import { NoteDataProvider } from "./context/NoteDataContext";
import { SettingsProvider } from "./context/SettingsContext";
import { LayoutProvider } from "./context/LayoutContext";
import { SidebarProvider } from "./context/SidebarContext";
import { OverlayProvider } from "./context/OverlayContext";
import ErrorBoundary from "./components/ErrorBoundary";
import BoojyNotes from "./BoojyNotes";
import { isWeb, isCapacitor } from "./utils/platform";

// Inject CSS Custom Highlight API styles for find-in-note
const highlightStyle = document.createElement("style");
highlightStyle.textContent = `
  ::highlight(find-matches) { background: rgba(255, 200, 0, 0.3); }
  ::highlight(find-active) { background: rgba(255, 150, 0, 0.5); }
`;
document.head.appendChild(highlightStyle);

// Log unhandled promise rejections
window.addEventListener("unhandledrejection", (e) => console.error("[unhandled]", e.reason));

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <NoteDataProvider>
        <SettingsProvider>
          <LayoutProvider>
            <SidebarProvider>
              <OverlayProvider>
                <ErrorBoundary>
                  <BoojyNotes />
                </ErrorBoundary>
              </OverlayProvider>
            </SidebarProvider>
          </LayoutProvider>
        </SettingsProvider>
      </NoteDataProvider>
    </ThemeProvider>
  </StrictMode>,
);

// Register service worker for PWA (web only, not Electron or Capacitor)
if (isWeb && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Dismiss Capacitor splash screen after render
if (isCapacitor) {
  import("@capacitor/splash-screen").then(({ SplashScreen }) => {
    SplashScreen.hide();
  });

  // Handle Android hardware back button
  import("@capacitor/app").then(({ App }) => {
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.minimizeApp();
      }
    });
  });
}
