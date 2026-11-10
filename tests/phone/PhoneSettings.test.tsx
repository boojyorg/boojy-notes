/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../src/context/ThemeContext";
import PhoneSettings from "../../src/phone/PhoneSettings";
import type { PhoneSync } from "../../src/phone/useSyncStatus";
import type { SyncStatus } from "../../src/sync/syncStatus";

afterEach(cleanup);

const OFF: SyncStatus = { state: "off", folder: null, lastSynced: null, problems: [] };
const SYNCED: SyncStatus = { state: "synced", folder: "Personal", lastSynced: null, problems: [] };
const sync = (over: Partial<PhoneSync> = {}): PhoneSync => ({
  status: OFF,
  syncNow: vi.fn(),
  signInAgain: vi.fn(async () => {}),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  moveToFolder: undefined,
  notesFolder: null,
  ...over,
});
const show = (s: PhoneSync | null, onClose = vi.fn()) => {
  render(
    <ThemeProvider>
      <PhoneSettings open sync={s} onClose={onClose} />
    </ThemeProvider>,
  );
  return onClose;
};
const menuOf = (testId: string) => {
  fireEvent.click(screen.getByTestId(testId));
  return screen.getAllByRole("menuitem").map((el) => el.textContent);
};

describe("Settings on the phone", () => {
  it("says the notes are inside the app, and offers to move them to a folder", () => {
    const move = vi.fn(async () => {});
    show(sync({ moveToFolder: move }));
    expect(screen.getByTestId("settings-folder").textContent).toContain("Inside the app");
    expect(screen.getByText(/removed if you uninstall/)).toBeTruthy();
    expect(menuOf("settings-folder")).toEqual(["Move to a folder…"]);
    fireEvent.click(screen.getByText("Move to a folder…"));
    expect(move).toHaveBeenCalledOnce();
  });

  // Nothing can be done about a folder yet: a row that opened an empty menu would be a dead control.
  it("names the folder the notes are in, as a row that is only read", () => {
    show(sync({ notesFolder: "Documents/Boojy Notes" }));
    const row = screen.getByTestId("settings-folder");
    expect(row.textContent).toContain("Documents/Boojy Notes");
    expect(row.tagName).toBe("DIV");
  });

  it("connects Dropbox when none is connected", () => {
    const s = sync();
    show(s);
    expect(screen.getByTestId("settings-dropbox").textContent).toContain("Not connected");
    expect(menuOf("settings-dropbox")).toEqual(["Connect Dropbox"]);
    fireEvent.click(screen.getByText("Connect Dropbox"));
    expect(s.connect).toHaveBeenCalledOnce();
  });

  it("names the Dropbox folder and its state, with Sync now and Disconnect", () => {
    const s = sync({ status: SYNCED });
    show(s);
    expect(screen.getByTestId("settings-dropbox").textContent).toContain("Personal · Synced");
    expect(menuOf("settings-dropbox")).toEqual(["Sync now", "Disconnect Dropbox"]);
    fireEvent.click(screen.getByText("Disconnect Dropbox"));
    expect(s.disconnect).toHaveBeenCalledOnce();
  });

  it("leads with Sign in again when Dropbox wants the person", () => {
    show(
      sync({
        status: { ...SYNCED, state: "problem", problems: [{ kind: "signed-out" }] },
      }),
    );
    expect(menuOf("settings-dropbox")[0]).toBe("Sign in again");
  });

  it("goes back on its arrow and on Escape, but an open menu takes its own Escape", () => {
    const onClose = show(sync());
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("settings-dropbox"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("is nothing while closed", () => {
    render(
      <ThemeProvider>
        <PhoneSettings open={false} sync={sync()} onClose={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("phone-settings")).toBeNull();
  });
});
