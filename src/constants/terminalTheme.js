import { BG, TEXT, ACCENT } from "./colors";

export function getTerminalTheme() {
  return {
    background: BG.editor,
    foreground: TEXT.primary,
    cursor: ACCENT.primary,
    cursorAccent: BG.editor,
    selectionBackground: ACCENT.primary + "40",
    selectionForeground: TEXT.primary,
    black: "#1E1E24",
    red: "#FF5C57",
    green: "#5AF78E",
    yellow: "#F3F99D",
    blue: "#57C7FF",
    magenta: "#FF6AC1",
    cyan: ACCENT.primary,
    white: TEXT.primary,
    brightBlack: "#686868",
    brightRed: "#FF5C57",
    brightGreen: "#5AF78E",
    brightYellow: "#F3F99D",
    brightBlue: "#57C7FF",
    brightMagenta: "#FF6AC1",
    brightCyan: ACCENT.hover,
    brightWhite: "#FFFFFF",
  };
}
