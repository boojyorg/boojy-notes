import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import BoojyNotes from "./BoojyNotes";

// Inject CSS Custom Highlight API styles for find-in-note
const highlightStyle = document.createElement("style");
highlightStyle.textContent = `
  ::highlight(find-matches) { background: rgba(255, 200, 0, 0.3); }
  ::highlight(find-active) { background: rgba(255, 150, 0, 0.5); }
`;
document.head.appendChild(highlightStyle);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <BoojyNotes />
    </ThemeProvider>
  </StrictMode>,
);
