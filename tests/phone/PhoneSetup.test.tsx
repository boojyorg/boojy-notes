/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../src/context/ThemeContext";
import type { FolderAccessPlugin } from "../../src/phone/folderFiles";
import { FolderLost, PhoneSetup } from "../../src/phone/PhoneSetup";

afterEach(cleanup);

const DEFAULT = { tree: "content://tree/default", root: "primary:Documents/Boojy Notes" };
const OTHER = { tree: "content://tree/other", root: "primary:Documents/Work notes" };

function access(answers: Awaited<ReturnType<FolderAccessPlugin["pick"]>>[]) {
  const pick = vi.fn(async () => answers.shift() ?? { picked: false });
  const ensureDefault = vi.fn(async ({ name }: { name: string }) => ({
    made: true,
    initial: `primary:Documents/${name}`,
  }));
  return { pick, ensureDefault, plugin: { pick, ensureDefault } as unknown as FolderAccessPlugin };
}
const show = (plugin: FolderAccessPlugin, granted: typeof DEFAULT | null = null) => {
  const onDone = vi.fn();
  render(
    <ThemeProvider>
      <PhoneSetup folderName="Boojy Notes" granted={granted} onDone={onDone} access={plugin} />
    </ThemeProvider>,
  );
  return onDone;
};
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

const APP_LINE = "Or keep notes inside the app (removed on uninstall)";
/** The second page, where the choices are. */
const showSetup = (plugin: FolderAccessPlugin) => {
  const onDone = show(plugin);
  tap(/Get started/);
  return onDone;
};

// A location added from Home starts the app again with no folder chosen yet.
describe("a storage location added later", () => {
  const onCancel = vi.fn();
  const showAdded = (plugin: FolderAccessPlugin, taken: string[] = []) => {
    const onDone = vi.fn();
    onCancel.mockClear();
    render(
      <ThemeProvider>
        <PhoneSetup
          folderName="Work"
          location="Work"
          taken={taken}
          onCancel={onCancel}
          onDone={onDone}
          access={plugin}
        />
      </ThemeProvider>,
    );
    return onDone;
  };

  it("is asked its folder alone, under its name: no welcome, no appearance", () => {
    showAdded(access([]).plugin);
    expect(screen.getByRole("heading", { name: "Work" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Welcome to Boojy Notes" })).toBeNull();
    expect(screen.queryByText("Appearance")).toBeNull();
    expect(screen.getByRole("button", { name: /Documents\/Work/ })).toBeTruthy();
  });

  // Added by mistake: there must be a way out that adds nothing.
  it("is left unadded on Back", () => {
    const onDone = showAdded(access([]).plugin);
    tap("Back");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("refuses the folder another location keeps its notes in, and says why", async () => {
    const a = access([{ picked: true, ...DEFAULT }]);
    const onDone = showAdded(a.plugin, [DEFAULT.tree]);
    tap(/Continue/);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Another storage location/);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("takes the folder Android grants, in a folder named after it", async () => {
    const WORK = { tree: "content://tree/work", root: "primary:Documents/Work" };
    const a = access([{ picked: true, ...WORK }]);
    const onDone = showAdded(a.plugin);
    tap(/Continue/);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(WORK));
    expect(a.ensureDefault).toHaveBeenCalledWith({ name: "Work" });
  });
});

describe("first launch on the phone: what the app is", () => {
  it("names the app and says what it is, and asks nothing", () => {
    const a = access([]);
    show(a.plugin);
    expect(screen.getByTestId("wordmark")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Welcome to Boojy Notes" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Your notes are Markdown files you own",
      "Works offline, with no account",
      "Sync with Dropbox if you want to",
    ]);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Get started"]);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(a.pick).not.toHaveBeenCalled();
  });

  it("Get started shows the choices, and Back returns", () => {
    show(access([]).plugin);
    tap(/Get started/);
    expect(screen.getByRole("heading", { name: "Set up" })).toBeTruthy();
    tap("Back");
    expect(screen.getByRole("heading", { name: "Welcome to Boojy Notes" })).toBeTruthy();
  });

  it("a setup cut short after its folder was granted opens on the choices, showing that folder", () => {
    show(access([]).plugin, OTHER);
    expect(screen.getByRole("heading", { name: "Set up" })).toBeTruthy();
    expect(screen.getByText("Documents/Work notes")).toBeTruthy();
  });
});

describe("first launch on the phone: the folder and the appearance", () => {
  it("has the default folder filled in, the appearance, and one way on", () => {
    showSetup(access([]).plugin);
    expect(screen.getByText("Documents/Boojy Notes")).toBeTruthy();
    expect(screen.getByText("Android will ask you to confirm it.")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeTruthy();
    // The answer that loses the notes on uninstall is not offered up front.
    expect(screen.queryByRole("button", { name: APP_LINE })).toBeNull();
  });

  it("Continue makes the default folder, opens Android's screen inside it, and goes on with what was picked", async () => {
    const a = access([{ picked: true, ...DEFAULT }]);
    const onDone = showSetup(a.plugin);
    tap(/Continue/);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(DEFAULT));
    expect(a.ensureDefault).toHaveBeenCalledWith({ name: "Boojy Notes" });
    expect(a.pick).toHaveBeenCalledWith({ initial: "primary:Documents/Boojy Notes" });
  });

  // Without it, someone who will not or cannot give a folder is held at setup.
  it("leaving Android's screen changes nothing, and then offers the app's own storage", async () => {
    const a = access([{ picked: false }]);
    const onDone = showSetup(a.plugin);
    tap(/Continue/);
    const line = await screen.findByRole("button", { name: APP_LINE });
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("Documents/Boojy Notes")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(line);
    expect(onDone).toHaveBeenCalledWith(null);
    expect(a.pick).toHaveBeenCalledTimes(1);
  });

  it("refuses a folder that is not on the phone, in a line, stays, and offers the app's storage", async () => {
    const a = access([{ picked: false, refused: "not-on-device" }]);
    const onDone = showSetup(a.plugin);
    tap(/Continue/);
    expect((await screen.findByRole("alert")).textContent).toBe("Choose a folder on this phone.");
    expect(screen.getByRole("button", { name: APP_LINE })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("the folder row shows the folder picked, and Continue then asks Android nothing more", async () => {
    const a = access([{ picked: true, ...OTHER }]);
    const onDone = showSetup(a.plugin);
    tap(/^Notes folder/);
    expect(await screen.findByText("Documents/Work notes")).toBeTruthy();
    expect(a.pick).toHaveBeenCalledWith({});
    expect(screen.queryByText("Android will ask you to confirm it.")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    tap(/Continue/);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(OTHER));
    expect(a.pick).toHaveBeenCalledTimes(1);
    expect(a.ensureDefault).not.toHaveBeenCalled();
  });
});

describe("the chosen folder out of reach", () => {
  const showLost = (plugin: FolderAccessPlugin) => {
    const onDone = vi.fn();
    render(
      <ThemeProvider>
        <FolderLost onDone={onDone} access={plugin} />
      </ThemeProvider>,
    );
    return onDone;
  };

  // The app's storage here would read as every note being gone.
  it("offers only to choose the folder again", () => {
    showLost(access([]).plugin);
    expect(screen.getByRole("heading").textContent).toBe(
      "Boojy Notes can't reach your notes folder",
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Choose the folder again",
    ]);
  });

  it("goes on with the folder chosen, and stays when Android's screen is left", async () => {
    const a = access([{ picked: false }, { picked: true, ...OTHER }]);
    const onDone = showLost(a.plugin);
    tap(/Choose the folder again/);
    await waitFor(() => expect(a.pick).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
    tap(/Choose the folder again/);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(OTHER));
  });
});
