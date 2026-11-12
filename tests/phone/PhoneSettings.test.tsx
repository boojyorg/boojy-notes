/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "../../src/context/SettingsContext";
import { ThemeProvider } from "../../src/context/ThemeContext";
import type { LocationRow } from "../../src/phone/locations";
import PhoneSettings, { removePrompt } from "../../src/phone/PhoneSettings";
import { settingsToReopen } from "../../src/phone/reopenSettings";
import type { PhoneStorage } from "../../src/phone/usePhoneStorage";
import type { PhoneSync } from "../../src/phone/useSyncStatus";
import type { SyncStatus } from "../../src/sync/syncStatus";

afterEach(cleanup);

const OFF: SyncStatus = {
  state: "off",
  folder: null,
  lastSynced: null,
  problems: [],
  progress: null,
};
const SYNCED: SyncStatus = { ...OFF, state: "synced", folder: "Personal" };
const sync = (over: Partial<PhoneSync> = {}): PhoneSync => ({
  status: OFF,
  choosing: null,
  syncNow: vi.fn(),
  signInAgain: vi.fn(async () => {}),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  ...over,
});
/** The first location, open, in a folder; as the list was read at start (sync is live). */
const MAIN: LocationRow = {
  id: "main",
  name: "Phone",
  named: false,
  open: true,
  dropbox: null,
  phone: "Documents/Boojy Notes",
};
const WORK: LocationRow = {
  id: "w",
  name: "Work",
  named: true,
  open: false,
  dropbox: "Team",
  phone: "Documents/Work",
};
const storageOf = (over: Partial<PhoneStorage> = {}): PhoneStorage => ({
  notesFolder: "Documents/Boojy Notes",
  moveToFolder: undefined,
  locations: [MAIN],
  openLocation: vi.fn(async () => true),
  addLocation: vi.fn(async () => true),
  renameLocation: vi.fn(async () => true),
  removeLocation: vi.fn(async () => true),
  ...over,
});
const show = (
  s: PhoneSync | null,
  storage: PhoneStorage = storageOf(),
  { onClose = vi.fn(), confirm = vi.fn(async () => true) } = {},
) => {
  render(
    <ThemeProvider>
      <SettingsProvider>
        <PhoneSettings open sync={s} storage={storage} confirm={confirm} onClose={onClose} />
      </SettingsProvider>
    </ThemeProvider>,
  );
  return { onClose, confirm };
};
const menuOf = (id: string) => {
  fireEvent.click(screen.getByTestId(`location-more-${id}`));
  return screen.getAllByRole("menuitem").map((el) => el.textContent);
};
const rowText = (id: string) => screen.getByTestId(`location-${id}`).textContent;

describe("Settings on the phone", () => {
  // One list, as the desktop's: no section for the folder and another for Dropbox.
  it("lists the storage locations, each with its name and where it is, the open one ticked", () => {
    show(sync({ status: SYNCED }), storageOf({ locations: [MAIN, WORK] }));
    expect(screen.getByText("Storage locations")).toBeTruthy();
    // The open one follows sync as it is now: its Dropbox folder names it, and says where it is.
    expect(rowText("main")).toBe("PersonalDropbox/Apps/Boojy Notes/Personal");
    expect(rowText("w")).toBe("WorkDropbox/Apps/Boojy Notes/Team");
    expect(screen.getByTestId("location-main").getAttribute("aria-label")).toMatch(/, open$/);
    expect(screen.getByTestId("location-w").getAttribute("aria-label")).not.toMatch(/open/);
    expect(screen.queryByText("Notes folder")).toBeNull();
    expect(screen.queryByText(/On a computer/)).toBeNull();
  });

  // As on the desktop: the row is the way to it, and its ··· is what can be done to it.
  it("opens a location on a press of its row; the open one is not there to press", () => {
    const storage = storageOf({ locations: [MAIN, WORK] });
    show(sync(), storage);
    expect(screen.getByTestId("location-main").tagName).toBe("DIV");
    expect(screen.getByTestId("location-main").getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByTestId("location-w"));
    expect(storage.openLocation).toHaveBeenCalledWith("w");
    // The app starts again in it, here in Settings: not on Home, a step from where it was asked.
    expect(settingsToReopen()).toBe(true);
    expect(settingsToReopen()).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
    // The ··· opens the menu and opens nothing.
    fireEvent.click(screen.getByRole("button", { name: "More for Work" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(storage.openLocation).toHaveBeenCalledOnce();
  });

  // The app starts again on this page: with the tick moved at the press, nothing else changes.
  it("moves the tick at the press, before the app has started again, and back if it can't", async () => {
    let fail = () => {};
    const openLocation = vi.fn(() => new Promise<boolean>((done) => (fail = () => done(false))));
    show(sync(), storageOf({ locations: [MAIN, WORK], openLocation }));
    const ticked = () =>
      screen
        .getByTestId("location-tick")
        .closest("[data-testid^='location-']:not([data-testid='location-tick'])")
        ?.getAttribute("data-testid");
    expect(ticked()).toBe("location-main");
    fireEvent.click(screen.getByTestId("location-w"));
    expect(ticked()).toBe("location-w");
    expect(screen.getAllByTestId("location-tick")).toHaveLength(1);
    fail();
    await waitFor(() => expect(ticked()).toBe("location-main"));
  });

  it("doesn't ask a later start for Settings when the location could not be opened", async () => {
    const storage = storageOf({ locations: [MAIN, WORK], openLocation: vi.fn(async () => false) });
    show(sync(), storage);
    fireEvent.click(screen.getByTestId("location-w"));
    await waitFor(() => expect(storage.openLocation).toHaveBeenCalled());
    await waitFor(() => expect(settingsToReopen()).toBe(false));
  });

  it("says where a location that doesn't sync is on the phone: its folder, or inside the app", () => {
    show(sync(), storageOf({ locations: [MAIN, { ...WORK, dropbox: null, phone: null }] }));
    expect(rowText("main")).toBe("PhoneDocuments/Boojy Notes");
    expect(rowText("w")).toBe("WorkInside the app");
  });

  it("calls the app folder itself Boojy Notes, at its place in Dropbox", () => {
    show(sync({ status: { ...SYNCED, folder: "" } }));
    expect(rowText("main")).toBe("Boojy NotesDropbox/Apps/Boojy Notes");
  });

  describe("the open location's menu", () => {
    it("offers to sync it with Dropbox while it doesn't, then to rename it", () => {
      const s = sync();
      show(s);
      expect(menuOf("main")).toEqual(["Sync with Dropbox…", "Rename…"]);
      fireEvent.click(screen.getByText("Sync with Dropbox…"));
      expect(s.connect).toHaveBeenCalledOnce();
    });

    it("syncs now or disconnects once it does, and says where its notes are on the phone", () => {
      const s = sync({ status: SYNCED });
      show(s);
      expect(menuOf("main")).toEqual(["Sync now", "Disconnect Dropbox", "Rename…"]);
      expect(screen.getByText("On this phone: Documents/Boojy Notes")).toBeTruthy();
      fireEvent.click(screen.getByText("Disconnect Dropbox"));
      expect(s.disconnect).toHaveBeenCalledOnce();
    });

    it("leads with Sign in again when Dropbox wants the person, and says why under the row", () => {
      show(sync({ status: { ...SYNCED, state: "problem", problems: [{ kind: "signed-out" }] } }));
      expect(screen.getByRole("alert").textContent).toMatch(/sign-in has expired/);
      expect(menuOf("main")[0]).toBe("Sign in again");
    });

    // The cloud says synced: words are for what it can't say.
    it("says nothing under the row while synced, and counts a long sync", () => {
      show(sync({ status: SYNCED }));
      expect(screen.queryByText(/Synced with Dropbox/)).toBeNull();
      cleanup();
      show(sync({ status: { ...SYNCED, state: "syncing", progress: { done: 3, total: 40 } } }));
      expect(screen.getByRole("status").textContent).toBe("Syncing with Dropbox… 3 of 40 files");
    });

    it("moves notes kept inside the app to a folder, where the phone can", () => {
      const moveToFolder = vi.fn(async () => {});
      show(
        sync(),
        storageOf({ notesFolder: null, moveToFolder, locations: [{ ...MAIN, phone: null }] }),
      );
      expect(menuOf("main")).toEqual(["Sync with Dropbox…", "Rename…", "Move to a folder…"]);
      fireEvent.click(screen.getByText("Move to a folder…"));
      expect(moveToFolder).toHaveBeenCalledOnce();
    });

    it("has no sync to offer where the app has none", () => {
      show(null);
      expect(menuOf("main")).toEqual(["Rename…"]);
    });
  });

  // Sync and a move need the location open; a removal needs it closed.
  describe("a closed location's menu", () => {
    it("renames it or removes it, and nothing else", () => {
      show(sync(), storageOf({ locations: [MAIN, WORK] }));
      expect(menuOf("w")).toEqual(["Rename…", "Remove from list…"]);
    });

    it("removes it only once asked, saying its folder and its Dropbox stay", async () => {
      const storage = storageOf({ locations: [MAIN, WORK] });
      const confirm = vi.fn(async () => false);
      show(sync(), storage, { confirm });
      menuOf("w");
      fireEvent.click(screen.getByText("Remove from list…"));
      await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
      expect(confirm.mock.calls[0][0]).toMatchObject({
        message: "The folder and its notes stay in Documents/Work. Nothing in Dropbox changes.",
        danger: false,
      });
      expect(storage.removeLocation).not.toHaveBeenCalled();
      confirm.mockResolvedValueOnce(true);
      menuOf("w");
      fireEvent.click(screen.getByText("Remove from list…"));
      await waitFor(() => expect(storage.removeLocation).toHaveBeenCalledWith("w"));
    });

    // Inside the app there is no folder to keep: the notes go with the location.
    it("says a location kept inside the app loses its notes, in the danger colour", () => {
      expect(removePrompt({ ...WORK, dropbox: null, phone: null })).toMatchObject({
        message:
          "Its notes are kept inside the app, so they will be deleted from this phone. This can't be undone.",
        confirmLabel: "Remove and delete",
        danger: true,
      });
      expect(removePrompt({ ...WORK, phone: null }).message).toMatch(/copies in Dropbox stay/);
    });
  });

  describe("renaming a location", () => {
    it("asks the name over the page, starting from the one it has, and keeps the page on a clash", async () => {
      const storage = storageOf({ locations: [MAIN, WORK] });
      show(sync(), storage);
      menuOf("w");
      fireEvent.click(screen.getByText("Rename…"));
      const page = within(screen.getByRole("dialog", { name: "Rename location" }));
      const field = page.getByLabelText("Name") as HTMLInputElement;
      expect(field.value).toBe("Work");
      fireEvent.change(field, { target: { value: "phone" } });
      fireEvent.click(page.getByRole("button", { name: "Rename" }));
      expect(page.getByRole("alert").textContent).toBe("Another location has this name.");
      // Its own name is no clash.
      fireEvent.change(field, { target: { value: "Journal" } });
      fireEvent.click(page.getByRole("button", { name: "Rename" }));
      await waitFor(() => expect(storage.renameLocation).toHaveBeenCalledWith("w", "Journal"));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Rename location" })).toBeNull(),
      );
    });
  });

  describe("a connect asking which Dropbox folder", () => {
    const asking = (answer = vi.fn(), locations = [MAIN]) => {
      const { onClose } = show(
        sync({ choosing: { folders: ["Personal", "Work"], answer } }),
        storageOf({ locations }),
      );
      return { answer, onClose };
    };
    const rows = () => screen.getAllByTestId("sync-folder-choice").map((el) => el.textContent);

    it("offers the app folder first, then each folder, and answers with the one tapped", () => {
      const { answer } = asking();
      expect(rows()).toEqual(["Everything in Boojy Notes", "Personal", "Work"]);
      fireEvent.click(screen.getByText("Work"));
      expect(answer).toHaveBeenCalledWith("Work");
      fireEvent.click(screen.getByText("Everything in Boojy Notes"));
      expect(answer).toHaveBeenLastCalledWith("");
    });

    // Two locations over one Dropbox folder would each take the other's notes for its own.
    it("shows, but never offers, a folder another location on this phone syncs with", () => {
      const { answer } = asking(vi.fn(), [MAIN, { ...WORK, dropbox: "work" }]);
      expect(rows()).toEqual([
        "Everything in Boojy NotesUsed by another location",
        "Personal",
        "WorkUsed by another location",
      ]);
      fireEvent.click(screen.getAllByTestId("sync-folder-choice")[2]);
      fireEvent.click(screen.getAllByTestId("sync-folder-choice")[0]);
      expect(answer).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId("sync-folder-new"));
      fireEvent.change(screen.getByLabelText("New folder's name"), { target: { value: "WORK" } });
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
      expect(answer).not.toHaveBeenCalled();
    });

    it("takes a new folder's name, but none that is no single folder", () => {
      const { answer } = asking();
      fireEvent.click(screen.getByTestId("sync-folder-new"));
      const field = screen.getByLabelText("New folder's name");
      const create = screen.getByRole("button", { name: "Create" });
      for (const bad of ["", "a/b"]) {
        fireEvent.change(field, { target: { value: bad } });
        expect(create.getAttribute("aria-disabled")).toBe("true");
        fireEvent.click(create);
      }
      expect(answer).not.toHaveBeenCalled();
      fireEvent.change(field, { target: { value: "Recipes" } });
      fireEvent.click(create);
      expect(answer).toHaveBeenCalledWith("Recipes");
    });

    // Back answers the question, not Settings under it.
    it("connects nothing on Back or Escape, leaving Settings open", () => {
      const { answer, onClose } = asking();
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(
        within(screen.getByTestId("choose-sync-folder")).getByRole("button", { name: "Back" }),
      );
      expect(answer.mock.calls).toEqual([[null], [null]]);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // The desktop's Add folder…: no page of the app's own, only Android's folder screen.
  describe("adding a storage location", () => {
    it("asks for nothing itself: the press goes straight to the folder", () => {
      const storage = storageOf();
      show(sync(), storage);
      fireEvent.click(screen.getByTestId("location-add"));
      expect(storage.addLocation).toHaveBeenCalledOnce();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });

    it("lists and offers nothing where the app has no locations (a browser)", () => {
      show(sync(), storageOf({ locations: [] }));
      expect(screen.queryByTestId("location-add")).toBeNull();
      expect(screen.queryByText("Storage locations")).toBeNull();
    });
  });

  it("goes back on its arrow and on Escape, but an open menu takes its own Escape", () => {
    const { onClose } = show(sync());
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("location-more-main"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // The phone has no keys for the interface size: Settings is the only way to it.
  it("keeps the interface size beside the theme", () => {
    show(sync());
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Larger" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Smaller" })).toBeTruthy();
  });

  // The whole page grew under the finger at each press of − or +, moving the button pressed.
  it("holds its size while the interface size changes under it, and takes the new one when next opened", () => {
    const Page = ({ open }: { open: boolean }) => (
      <ThemeProvider>
        <SettingsProvider>
          <PhoneSettings
            open={open}
            sync={sync()}
            storage={storageOf()}
            confirm={async () => true}
            onClose={() => {}}
          />
        </SettingsProvider>
      </ThemeProvider>
    );
    const view = render(<Page open />);
    const page = () => screen.getByTestId("phone-settings");
    expect(page().style.zoom).toBe("");
    const before = Number(page().style.getPropertyValue("--ui-scale"));
    fireEvent.click(screen.getByRole("button", { name: "Larger" }));
    // The app is larger now; the page's own zoom cancels exactly that.
    const zoom = Number(page().style.zoom);
    expect(zoom).toBeGreaterThan(0);
    expect(zoom).toBeLessThan(1);
    expect(Number(page().style.getPropertyValue("--ui-scale"))).toBe(before);
    view.rerender(<Page open={false} />);
    view.rerender(<Page open />);
    expect(page().style.zoom).toBe("");
    expect(Number(page().style.getPropertyValue("--ui-scale"))).toBeGreaterThan(before);
  });

  // A closed menu leaves a copy of itself for a moment, still a `menu` by role:
  // Back then was no one's, and Android's Back put the app in the background.
  it("goes back on Escape while a closed menu's leaving copy is still there", () => {
    const { onClose } = show(sync());
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
          <PhoneSettings
            open={false}
            sync={sync()}
            storage={storageOf()}
            confirm={async () => true}
            onClose={() => {}}
          />
        </SettingsProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("phone-settings")).toBeNull();
  });
});
