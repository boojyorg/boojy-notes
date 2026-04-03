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

// Configure Capacitor native UI
if (isCapacitor) {
  import("@capacitor/splash-screen").then(({ SplashScreen }) => {
    SplashScreen.hide();
  });

  // Transparent status bar so safe-area-inset-top works
  import("@capacitor/status-bar")
    .then(({ StatusBar, Style }) => {
      StatusBar.setOverlaysWebView({ overlay: true });
      StatusBar.setStyle({ style: Style.Dark });
    })
    .catch(() => {});

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
