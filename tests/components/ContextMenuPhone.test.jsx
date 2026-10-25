/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// The phone's vault cannot copy a folder yet: the menu must not offer it.
vi.mock("../../src/utils/platform", async (actual) => ({ ...(await actual()), isPhone: true }));
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { elevated: "#2a2a2e", surface: "#333", divider: "#444", hover: "#555" },
      ACCENT: { primary: "#A4CACE", text: "#A4CACE", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#ef4444" },
      overlay: (a) => `rgba(255,255,255,${a})`,
    },
    isDark: true,
  }),
}));
vi.mock("../../src/context/SettingsContext", () => ({
  useSettings: () => ({ setSettingsOpen: vi.fn() }),
}));

const { default: ContextMenu } = await import("../../src/components/ContextMenu.jsx");

afterEach(cleanup);

describe("a folder's menu on the phone", () => {
  it("offers no Duplicate folder", () => {
    const { getAllByRole } = render(
      <ContextMenu
        ctxMenu={{ type: "folder", id: "Work", x: 10, y: 10 }}
        setCtxMenu={vi.fn()}
        createNote={vi.fn()}
        createFolder={vi.fn()}
        setRenamingFolder={vi.fn()}
        deleteFolder={vi.fn()}
        duplicateFolder={vi.fn()}
        onMoveTo={vi.fn()}
        selectedNotes={new Set()}
      />,
    );
    expect(getAllByRole("menuitem").map((el) => el.textContent)).toEqual([
      "New note",
      "New folder",
      "Rename",
      "Move to…",
      "Delete folder",
    ]);
  });
});
