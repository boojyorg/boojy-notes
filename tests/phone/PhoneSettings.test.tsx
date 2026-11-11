/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  choosing: null,
  syncNow: vi.fn(),
  signInAgain: vi.fn(async () => {}),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  ...over,
});
const NO_LOCATIONS = {
  locations: [],
  openLocation: vi.fn(async () => true),
  addLocation: vi.fn(async () => true),
};
const IN_APP: PhoneStorage = { notesFolder: null, moveToFolder: undefined, ...NO_LOCATIONS };
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
    show(sync(), { ...IN_APP, moveToFolder: move });
    expect(screen.getByTestId("settings-folder").textContent).toContain("Inside the app");
    expect(screen.getByText(/removed if you uninstall/)).toBeTruthy();
    expect(menuOf("settings-folder")).toEqual(["Move to a folder…"]);
    fireEvent.click(screen.getByText("Move to a folder…"));
    expect(move).toHaveBeenCalledOnce();
  });

  // Nothing can be done about a folder yet: a row that opened an empty menu would be a dead control.
  it("names the folder the notes are in, as a row that is only read", () => {
    show(sync(), { ...IN_APP, notesFolder: "Documents/Boojy Notes" });
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

  // The folder is one nobody chose a place for: the page says where a computer finds it.
  it("says where the Dropbox folder is on a computer, only while connected", () => {
    show(sync({ status: SYNCED }));
    expect(
      screen.getByText("On a computer: Boojy Notes › Personal, in your Dropbox's Apps folder."),
    ).toBeTruthy();
    cleanup();
    show(sync());
    expect(screen.queryByText(/On a computer/)).toBeNull();
  });

  it("calls the app folder itself Boojy Notes, and says so for a computer", () => {
    show(sync({ status: { ...SYNCED, folder: "" } }));
    expect(screen.getByTestId("settings-dropbox").textContent).toBe("Boojy Notes");
    expect(
      screen.getByText("On a computer: Boojy Notes, in your Dropbox's Apps folder."),
    ).toBeTruthy();
  });

  describe("a connect asking which Dropbox folder", () => {
    const asking = (answer = vi.fn()) => {
      const onClose = show(sync({ choosing: { folders: ["Personal", "Work"], answer } }));
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

  // A location is added rarely and switched often: Home's menu switches, Settings adds.
  describe("adding a storage location", () => {
    const listed = () => {
      const addLocation = vi.fn(async () => true);
      const onClose = show(sync(), {
        ...IN_APP,
        locations: [{ id: "main", name: "Phone", open: true, cloud: false }],
        addLocation,
      });
      return { addLocation, onClose };
    };

    it("asks its name over the page, and adds it", () => {
      const { addLocation } = listed();
      fireEvent.click(screen.getByTestId("location-add"));
      const page = within(screen.getByTestId("new-location"));
      fireEvent.change(page.getByLabelText("Name"), { target: { value: "Phone" } });
      fireEvent.click(page.getByRole("button", { name: "Add" }));
      expect(page.getByRole("alert").textContent).toBe("Another location has this name.");
      fireEvent.change(page.getByLabelText("Name"), { target: { value: "Private" } });
      fireEvent.click(page.getByRole("button", { name: "Add" }));
      expect(addLocation).toHaveBeenCalledWith("Private");
    });

    it("goes back to Settings, not out of it, on Back", () => {
      const { onClose } = listed();
      fireEvent.click(screen.getByTestId("location-add"));
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("new-location")).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("is not offered where the app has no locations (a browser)", () => {
      show(sync());
      expect(screen.queryByTestId("location-add")).toBeNull();
    });
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
    show(null, { ...IN_APP, notesFolder: "Documents/Boojy Notes" });
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

  // The whole page grew under the finger at each press of − or +, moving the button pressed.
  it("holds its size while the interface size changes under it, and takes the new one when next opened", () => {
    const Page = ({ open }: { open: boolean }) => (
      <ThemeProvider>
        <SettingsProvider>
          <PhoneSettings open={open} sync={sync()} storage={IN_APP} onClose={() => {}} />
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
