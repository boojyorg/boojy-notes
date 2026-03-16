import { vi } from "vitest";

export const mockTheme = {
  theme: {
    BG: {
      darkest: "#1a1a1a",
      dark: "#222",
      surface: "#2a2a2a",
      elevated: "#333",
      hover: "#444",
      divider: "#555",
    },
    TEXT: {
      primary: "#eee",
      secondary: "#bbb",
      muted: "#888",
    },
    ACCENT: "#A4CACE",
    overlay: (opacity) => `rgba(255,255,255,${opacity})`,
  },
  setThemeMode: vi.fn(),
  themeMode: "dark",
};

export function mockUseTheme() {
  vi.mock("../../src/hooks/useTheme", () => ({
    useTheme: () => mockTheme,
  }));
}
