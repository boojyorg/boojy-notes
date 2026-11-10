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

describe("first launch on the phone", () => {
  it("says what the desktop's setup says, with the default folder filled in", () => {
    show(access([]).plugin);
    expect(screen.getByRole("heading", { name: "Welcome to Boojy Notes" })).toBeTruthy();
    expect(screen.getByText(/saved as Markdown files in a folder you choose/)).toBeTruthy();
    expect(screen.getByText("Documents/Boojy Notes")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeTruthy();
    expect(screen.getByText("Android will ask you to confirm it.")).toBeTruthy();
    // The other answer says what it costs in the same line.
    expect(
      screen.getByRole("button", { name: "Or keep notes inside the app (removed on uninstall)" }),
    ).toBeTruthy();
    // One bordered button on the screen: the folder is a row, not a second button.
    expect(screen.getByTestId("wordmark")).toBeTruthy();
  });

  it("Continue makes the default folder, opens Android's screen inside it, and goes on with what was picked", async () => {
    const a = access([{ picked: true, ...DEFAULT }]);
    const onDone = show(a.plugin);
    tap("Continue");
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(DEFAULT));
    expect(a.ensureDefault).toHaveBeenCalledWith({ name: "Boojy Notes" });
    expect(a.pick).toHaveBeenCalledWith({ initial: "primary:Documents/Boojy Notes" });
  });

  it("leaving Android's screen changes nothing: the same screen, no choice made", async () => {
    const a = access([{ picked: false }]);
    const onDone = show(a.plugin);
    tap("Continue");
    await waitFor(() => expect(a.pick).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("Documents/Boojy Notes")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses a folder that is not on the phone, in a line, and stays", async () => {
    const a = access([{ picked: false, refused: "not-on-device" }]);
    const onDone = show(a.plugin);
    tap("Continue");
    expect((await screen.findByRole("alert")).textContent).toBe("Choose a folder on this phone.");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("the folder row shows the folder picked, and Continue then asks Android nothing more", async () => {
    const a = access([{ picked: true, ...OTHER }]);
    const onDone = show(a.plugin);
    tap(/^Notes folder/);
    expect(await screen.findByText("Documents/Work notes")).toBeTruthy();
    expect(a.pick).toHaveBeenCalledWith({});
    expect(screen.queryByText("Android will ask you to confirm it.")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    tap("Continue");
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(OTHER));
    expect(a.pick).toHaveBeenCalledTimes(1);
    expect(a.ensureDefault).not.toHaveBeenCalled();
  });

  it("Keep notes inside the app goes straight on, with no Android screen", () => {
    const a = access([]);
    const onDone = show(a.plugin);
    tap(/keep notes inside the app/);
    expect(onDone).toHaveBeenCalledWith(null);
    expect(a.pick).not.toHaveBeenCalled();
  });

  it("a setup cut short after its folder was granted shows that folder", () => {
    show(access([]).plugin, OTHER);
    expect(screen.getByText("Documents/Work notes")).toBeTruthy();
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
    tap("Choose the folder again");
    await waitFor(() => expect(a.pick).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();
    tap("Choose the folder again");
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(OTHER));
  });
});
