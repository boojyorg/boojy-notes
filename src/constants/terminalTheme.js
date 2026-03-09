export function getTerminalTheme(theme) {
  if (!theme) {
    // Fallback for cases called without theme
    return {
      background: "#040412",
      foreground: "#E8EAF0",
      cursor: "#A4CACE",
      cursorAccent: "#040412",
      selectionBackground: "#A4CACE40",
      selectionForeground: "#E8EAF0",
      black: "#1E1E24",
      red: "#FF5C57",
      green: "#5AF78E",
      yellow: "#F3F99D",
      blue: "#57C7FF",
      magenta: "#FF6AC1",
      cyan: "#A4CACE",
      white: "#E8EAF0",
      brightBlack: "#686868",
      brightRed: "#FF5C57",
      brightGreen: "#5AF78E",
      brightYellow: "#F3F99D",
      brightBlue: "#57C7FF",
      brightMagenta: "#FF6AC1",
      brightCyan: "#B8D8DC",
      brightWhite: "#FFFFFF",
    };
  }
  return {
    background: theme.BG.editor,
    foreground: theme.TEXT.primary,
    cursor: theme.ACCENT.primary,
    cursorAccent: theme.BG.editor,
    selectionBackground: theme.ACCENT.primary + "40",
    selectionForeground: theme.TEXT.primary,
    // Keep ANSI colors as-is (they don't change with theme)
    black: "#1E1E24",
    red: "#FF5C57",
    green: "#5AF78E",
    yellow: "#F3F99D",
    blue: "#57C7FF",
    magenta: "#FF6AC1",
    cyan: theme.ACCENT.primary,
    white: theme.TEXT.primary,
    brightBlack: "#686868",
    brightRed: "#FF5C57",
    brightGreen: "#5AF78E",
    brightYellow: "#F3F99D",
    brightBlue: "#57C7FF",
    brightMagenta: "#FF6AC1",
    brightCyan: theme.ACCENT.hover,
    brightWhite: "#FFFFFF",
  };
}
