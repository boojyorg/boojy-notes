/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SyncStatusButton from "../../src/components/SyncStatusButton";
import { ThemeProvider } from "../../src/context/ThemeContext";
import type { PhoneSync } from "../../src/phone/useSyncStatus";

afterEach(cleanup);

const sync = (moveToFolder?: () => Promise<void>): PhoneSync => ({
  status: { state: "off", folder: null, lastSynced: null, problems: [] },
  syncNow: vi.fn(),
  signInAgain: vi.fn(async () => {}),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  moveToFolder,
});
const openMenu = (s: PhoneSync) => {
  render(
    <ThemeProvider>
      <SyncStatusButton sync={s} />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByTestId("sync-status"));
};

describe("Home's menu, while the notes are inside the app", () => {
  it("offers Move notes to a folder… under Dropbox's item, and runs it", () => {
    const move = vi.fn(async () => {});
    openMenu(sync(move));
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Connect Dropbox", "Move notes to a folder…"]);
    fireEvent.click(screen.getByText("Move notes to a folder…"));
    expect(move).toHaveBeenCalledOnce();
  });

  it("offers no move once the notes are in a folder", () => {
    openMenu(sync());
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual([
      "Connect Dropbox",
    ]);
  });
});
