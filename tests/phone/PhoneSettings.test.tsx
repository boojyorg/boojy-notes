/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "../../src/context/SettingsContext";
import { ThemeProvider } from "../../src/context/ThemeContext";
import PhoneSettings from "../../src/phone/PhoneSettings";
import type { PhoneStorage } from "../../src/phone/usePhoneStorage";
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
  ...over,
});
const IN_APP: PhoneStorage = { notesFolder: null, moveToFolder: undefined };
const show = (s: PhoneSync | null, storage: PhoneStorage = IN_APP, onClose = vi.fn()) => {
  render(
    <ThemeProvider>
      <SettingsProvider>
        <PhoneSettings open sync={s} storage={storage} onClose={onClose} />
      </SettingsProvider>
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
    show(sync(), { notesFolder: null, moveToFolder: move });
    expect(screen.getByTestId("settings-folder").textContent).toContain("Inside the app");
    expect(screen.getByText(/removed if you uninstall/)).toBeTruthy();
    expect(menuOf("settings-folder")).toEqual(["Move to a folder…"]);
    fireEvent.click(screen.getByText("Move to a folder…"));
    expect(move).toHaveBeenCalledOnce();
  });

  // Nothing can be done about a folder yet: a row that opened an empty menu would be a dead control.
  it("names the folder the notes are in, as a row that is only read", () => {
    show(sync(), { notesFolder: "Documents/Boojy Notes", moveToFolder: undefined });
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

  it("names the Dropbox folder, its state under it, with Sync now and Disconnect", () => {
    const s = sync({ status: SYNCED });
    show(s);
    // The state is said once, under the row.
    expect(screen.getByTestId("settings-dropbox").textContent).toBe("Personal");
    expect(screen.getByText(/Synced with Dropbox/)).toBeTruthy();
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

  // Where the notes are is true with or without sync: it once read "Inside the app" with none.
  it("names the folder with no sync at all", () => {
    show(null, { notesFolder: "Documents/Boojy Notes", moveToFolder: undefined });
    expect(screen.getByTestId("settings-folder").textContent).toContain("Documents/Boojy Notes");
    expect(screen.queryByTestId("settings-dropbox")).toBeNull();
  });

  // The phone has no keys for the interface size: Settings is the only way to it.
  it("keeps the interface size beside the theme", () => {
    show(sync());
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Larger" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Smaller" })).toBeTruthy();
  });

  // A closed menu leaves a copy of itself for a moment, still a `menu` by role:
  // Back then was no one's, and Android's Back put the app in the background.
  it("goes back on Escape while a closed menu's leaving copy is still there", () => {
    const onClose = show(sync());
    const ghost = document.createElement("div");
    ghost.setAttribute("role", "menu");
    ghost.className = "motion-ghost";
    document.body.append(ghost);
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(esc);
    ghost.remove();
    expect(onClose).toHaveBeenCalledOnce();
    expect(esc.defaultPrevented).toBe(true);
  });

  it("is nothing while closed", () => {
    render(
      <ThemeProvider>
        <SettingsProvider>
          <PhoneSettings open={false} sync={sync()} storage={IN_APP} onClose={() => {}} />
        </SettingsProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("phone-settings")).toBeNull();
  });
});
