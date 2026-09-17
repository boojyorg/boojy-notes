/**
 * First-run setup (2026-09-17). A launch with no config and no default folder
 * shows one dialog over the empty app; every way out saves the choice on
 * screen, never shows it again, and lands in the draft note the app already
 * opened, with nothing written until the first keystroke. The default folder
 * is only named until setup ends, so a user who picks another folder is not
 * left with an empty one in Documents. An existing user, config or not, never
 * sees it: the flag is written silently on that launch.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SETTLE_MS, appGround, launchApp, sleep, waitForFile } from "./harness";

const config = (userData: string) =>
  JSON.parse(fs.readFileSync(path.join(userData, "config.json"), "utf-8"));

test("a fresh install shows setup; Create note makes the default folder and puts the caret in the body", async () => {
  const h = await launchApp({}, { firstRun: true });
  try {
    const dialog = h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" });
    await expect(dialog).toBeVisible();
    // Named, not made: nothing under Documents yet.
    expect(fs.existsSync(path.join(h.documents, "Boojy"))).toBe(false);
    await expect(dialog.getByTestId("notes-folder-path")).toHaveText(/Boojy\/Notes$/);
    // A folder that does not exist yet is not a control.
    await expect(dialog.getByRole("button", { name: /Show in Finder|Show in folder/ })).toHaveCount(
      0,
    );
    await expect(dialog.getByRole("radio", { name: "System" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => fs.existsSync(h.vault.dir)).toBe(true);
    expect(config(h.userData).setupDone).toBe(true);
    // Nothing written by ending setup: the draft waits for a keystroke.
    expect(fs.readdirSync(h.vault.dir).filter((f) => f.endsWith(".md"))).toEqual([]);

    // The caret is in the note's body, so typing is the first thing.
    const focused = await h.page.evaluate(() => {
      const node = window.getSelection()?.anchorNode;
      const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
      return el?.closest("[data-block-type]")
        ? "body"
        : document.activeElement?.getAttribute("aria-label");
    });
    expect(focused).toBe("body");
    await h.page.keyboard.type("Hello");
    await waitForFile(h.vault.file("Untitled.md"), (t) => t.includes("Hello"));
    await sleep(SETTLE_MS);
    // A one-block note is written without a trailing newline, as every note is.
    expect(h.vault.read("Untitled.md")).toMatch(/^Hello\n?$/);

    // Never again.
    await h.restart();
    await expect(h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" })).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Escape, × and a click outside accept the defaults, create no file, and leave the caret in the name", async () => {
  for (const way of ["escape", "close", "outside"] as const) {
    const h = await launchApp({}, { firstRun: true });
    try {
      const dialog = h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" });
      await expect(dialog).toBeVisible();
      if (way === "escape") await h.page.keyboard.press("Escape");
      else if (way === "close") await dialog.getByRole("button", { name: "Close" }).click();
      else await h.page.getByTestId("setup-scrim").click({ position: { x: 5, y: 5 } });
      await expect(dialog).toHaveCount(0);

      await expect.poll(() => fs.existsSync(h.vault.dir)).toBe(true);
      expect(config(h.userData).setupDone).toBe(true);
      await sleep(SETTLE_MS);
      expect(fs.readdirSync(h.vault.dir).filter((f) => f.endsWith(".md"))).toEqual([]);
      await expect(h.page.getByRole("textbox", { name: "Note title" })).toBeFocused();

      await h.restart();
      await expect(h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" })).toHaveCount(0);
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  }
});

test("choosing an existing Markdown folder in setup switches to it live and leaves Documents alone", async () => {
  const h = await launchApp({}, { firstRun: true });
  try {
    const chosen = path.join(h.documents, "..", "Existing");
    fs.mkdirSync(chosen, { recursive: true });
    fs.writeFileSync(path.join(chosen, "Old note.md"), "From before.\n");
    // The folder picker is the OS's; answer it from the main process.
    await h.app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, chosen);

    const dialog = h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" });
    await dialog.getByRole("button", { name: "Choose folder…" }).click();
    await expect(dialog.getByTestId("notes-folder-path")).toHaveText(/Existing$/);
    // The app behind the scrim already shows the folder's notes, and the
    // path is a control now that the folder exists.
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Old note" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /Show in Finder|Show in folder/ }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(dialog).toHaveCount(0);
    await sleep(SETTLE_MS);
    expect(fs.existsSync(path.join(h.documents, "Boojy"))).toBe(false);
    expect(config(h.userData)).toEqual({ notesDir: chosen, setupDone: true });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("cancelling the picker in setup changes nothing", async () => {
  const h = await launchApp({}, { firstRun: true });
  try {
    await h.app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    const dialog = h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" });
    await dialog.getByRole("button", { name: "Choose folder…" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("notes-folder-path")).toHaveText(/Boojy\/Notes$/);
    expect(fs.existsSync(path.join(h.documents, "Boojy"))).toBe(false);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the appearance chosen in setup applies live and survives a restart", async () => {
  const h = await launchApp({}, { firstRun: true });
  try {
    const dialog = h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" });
    const ground = () => appGround(h.page);
    await dialog.getByRole("radio", { name: "Dark" }).click();
    await expect.poll(ground).toBe("rgb(28, 28, 28)");
    await dialog.getByRole("radio", { name: "Light" }).click();
    await expect.poll(ground).toBe("rgb(252, 252, 252)");
    await dialog.getByRole("radio", { name: "Dark" }).click();
    await expect.poll(ground).toBe("rgb(28, 28, 28)");
    await h.page.keyboard.press("Escape");
    await h.restart();
    await expect.poll(ground).toBe("rgb(28, 28, 28)");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an existing user who never chose a folder is settled silently and keeps Light", async () => {
  const h = await launchApp(
    { "Mine.md": "Kept.\n" },
    { firstRun: true, defaultFolderExists: true },
  );
  try {
    await expect(h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" })).toHaveCount(0);
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Mine" })).toBeVisible();
    expect(config(h.userData)).toEqual({ setupDone: true });
    expect(await appGround(h.page)).toBe("rgb(252, 252, 252)");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a configured user never sees setup and keeps every setting", async () => {
  const h = await launchApp(
    { "Mine.md": "Kept.\n" },
    {
      prepare: () => {},
    },
  );
  try {
    // The harness writes a config with the vault, as every existing user has.
    await expect(h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" })).toHaveCount(0);
    expect(config(h.userData)).toEqual({ notesDir: h.vault.dir, setupDone: true });
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Mine" })).toBeVisible();
  } finally {
    await h.close();
  }
});
