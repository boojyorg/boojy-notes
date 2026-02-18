import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BoojyNotes from "../boojy-notes-mockup";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BoojyNotes />
  </StrictMode>
);
