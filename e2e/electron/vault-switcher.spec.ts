/**
 * Storage locations: the sidebar's list is named after the open location's
 * folder, and its menu (a click on the name, or ⌘O) switches between them and
 * says what the tree shows besides notes; Settings adds, and each row's ···
 * switches, renames (in the app alone), reveals and removes. Both list A–Z. Files that are not notes open in their own app; the attachment store
 * is its own row, hidden until asked for.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type AppHandle } from "./harness";

const readConfig = (userData: string) =>
  JSON.parse(fs.readFileSync(path.join(userData, "config.json"), "utf-8"));

/** Settings → Storage locations → Add folder…, answering the native picker with `dir`. */
async function addLocation(h: AppHandle, dir: string) {
  await h.app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] });
  }, dir);
  await h.page.getByRole("button", { name: "Add folder…" }).click();
  await expect(location(h, path.basename(dir))).toBeVisible();
}

/** Settings' row for the location named `name`. */
const location = (h: AppHandle, name: string) =>
  h.page.getByRole("listitem", { name: new RegExp(`^${name},`) });

/** The row's ··· menu, opened as a pointer does: the ··· shows on the row's hover. */
async function locationMenu(h: AppHandle, name: string) {
  await location(h, name).hover();
  await h.page.getByRole("button", { name: `${name} options` }).click();
  const menu = h.page.getByTestId("location-menu");
  await expect(menu).toBeVisible();
  return menu;
}

/** Finder's order, as the main process sorts. */
const az = (names: string[]) =>
  [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));

test("a location added in Settings is listed without switching; Switch to and the menu switch", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const home = path.basename(h.vault.dir);
    const other = path.join(path.dirname(h.vault.dir), "University");
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, "Timetable.md"), "Week 4.\n");

    const label = h.page.getByTestId("vault-label");
    await expect(label).toHaveText(home);

    // Hover lights it as the row's controls light: their grey, full ink.
    const bg = () => label.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await bg()).toBe("rgba(0, 0, 0, 0)");
    await label.hover();
    await expect.poll(bg).not.toBe("rgba(0, 0, 0, 0)");
    await h.page.mouse.move(600, 400);

    // ⌘O opens the menu from the keyboard; it only switches, and Manage
    // storage locations… is the way to Settings.
    await h.page.keyboard.press("Meta+o");
    const menu = h.page.getByRole("menu", { name: "Storage location" });
    await expect(menu).toBeVisible();
    await expect(menu).not.toContainText("Open folder");
    await menu.getByRole("menuitem", { name: "Manage storage locations…" }).click();
    const settings = h.page.getByRole("dialog", { name: "Settings" });
    await expect(settings.getByRole("list", { name: "Storage locations" })).toBeInViewport();

    // Add folder… lists it and stays where it is.
    await addLocation(h, other);
    await expect(label).toHaveText(home);
    expect(readConfig(h.userData).notesDir).toBe(h.vault.dir);

    // Switch to, in the row's ··· menu, switches at once, Settings staying open.
    const uni = location(h, "University");
    await (await locationMenu(h, "University")).getByTestId("location-switch").click();
    await expect(label).toHaveText("University");
    await expect(uni.getByTestId("location-current").locator("svg")).toBeVisible();
    // The open one offers no Switch to.
    const open = await locationMenu(h, "University");
    await expect(open.getByTestId("location-switch")).toHaveCount(0);
    await h.page.keyboard.press("Escape");

    // A click on a row switches too, and back again.
    await location(h, home).click();
    await expect(label).toHaveText(home);
    await location(h, "University").click();
    await expect(label).toHaveText("University");
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Timetable" })).toBeVisible();
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Alpha" })).toHaveCount(0);
    expect(readConfig(h.userData).notesDir).toBe(other);

    // The menu lists both A–Z, the open one checked, and switches back.
    await label.click();
    await expect(menu.getByRole("menuitemradio")).toHaveText(az([home, "University"]));
    await expect(menu.getByRole("menuitemradio", { name: "University" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await menu.getByRole("menuitemradio", { name: home }).click();
    await expect(label).toHaveText(home);
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Alpha" })).toBeVisible();
    expect(readConfig(h.userData).notesDir).toBe(h.vault.dir);

    // Nothing moved between them.
    expect(fs.existsSync(path.join(other, "Alpha.md"))).toBe(false);
    expect(fs.existsSync(h.vault.file("Timetable.md"))).toBe(false);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a location gone from disk stays listed, muted and unchosen, and is never recreated", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const gone = path.join(path.dirname(h.vault.dir), "Old Journal");
    fs.mkdirSync(gone);
    await h.page.getByTestId("wordmark-settings-button").click();
    await addLocation(h, gone);
    fs.rmSync(gone, { recursive: true });
    await h.page.keyboard.press("Escape");

    // Settings, opened again, reads the list as it is now.
    await h.page.getByTestId("wordmark-settings-button").click();
    await expect(location(h, "Old Journal")).toContainText("Not found");
    await h.page.keyboard.press("Escape");

    const label = h.page.getByTestId("vault-label");
    await label.click();
    const row = h.page.getByRole("menuitemradio", { name: /Old Journal/ });
    await expect(row).toHaveAttribute("aria-disabled", "true");
    await expect(row).toContainText("Not found");
    await row.click({ force: true });
    await expect(label).toHaveText(path.basename(h.vault.dir));
    await h.page.keyboard.press("Escape");

    // Settings says so too, keeping where it was; its menu offers only what
    // can work, and Remove from list… removes it after asking.
    await h.page.getByTestId("wordmark-settings-button").click();
    const old = location(h, "Old Journal");
    await expect(old).toContainText("Old Journal · Not found");
    const oldMenu = await locationMenu(h, "Old Journal");
    await expect(oldMenu.getByRole("menuitem")).toHaveText(["Rename…", "Remove from list…"]);
    await oldMenu.getByTestId("location-remove").click();
    const ask = h.page.getByRole("alertdialog", { name: 'Remove "Old Journal" from Boojy Notes?' });
    await expect(ask).toContainText("The folder and its notes stay in");
    await ask.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(old).toHaveCount(0);
    expect(fs.existsSync(gone)).toBe(false);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("other files show beside the notes; attachments only when asked; both toggles are per vault", async () => {
  const h = await launchApp({
    "Alpha.md": "Alpha.\n",
    "reading-list.pdf": "%PDF-1.4\n",
    "Uni/lecture-3.pptx": "x",
    "attachments/diagram-1.png": "x",
  });
  try {
    const tree = h.page.getByRole("tree");
    await expect(tree.getByRole("treeitem", { name: "reading-list.pdf" })).toBeVisible();
    await expect(h.page.getByTestId("attachments-row")).toHaveCount(0);

    await h.page.getByTestId("vault-label").click();
    await h.page.getByRole("menuitemcheckbox", { name: "Show attachments" }).click();
    await h.page.keyboard.press("Escape");
    const store = h.page.getByTestId("attachments-row");
    await expect(store).toBeVisible();
    await store.click();
    await expect(tree.getByRole("treeitem", { name: "diagram-1.png" })).toBeVisible();

    await h.page.getByTestId("vault-label").click();
    await h.page.getByRole("menuitemcheckbox", { name: "Show other files" }).click();
    await h.page.keyboard.press("Escape");
    await expect(tree.getByRole("treeitem", { name: "reading-list.pdf" })).toHaveCount(0);
    await expect(store).toBeVisible();

    // A file added in Finder shows when the window comes back to the front.
    fs.writeFileSync(h.vault.file("attachments/scan.png"), "x");
    await h.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(tree.getByRole("treeitem", { name: "scan.png" })).toBeVisible();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a file that is not a note goes to the Trash from its menu, with a toast", async () => {
  test.skip(process.platform === "linux", "Linux CI has no desktop Trash");
  const h = await launchApp({ "Alpha.md": "Alpha.\n", "handout.pdf": "%PDF-1.4\n" });
  try {
    const row = h.page.getByRole("treeitem", { name: "handout.pdf" });
    await row.click({ button: "right" });
    const menu = h.page.getByRole("menu", { name: "Context menu" });
    await expect(menu.getByRole("menuitem")).toHaveText(["Open", "Show in Finder", "Delete"]);
    await menu.getByRole("menuitem", { name: "Delete" }).click();
    await expect(row).toHaveCount(0);
    await expect(
      h.page.getByRole("status").filter({ hasText: "moved to the Trash" }),
    ).toBeVisible();
    expect(fs.existsSync(h.vault.file("handout.pdf"))).toBe(false);
    expect(fs.existsSync(h.vault.file("Alpha.md"))).toBe(true);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("removing the open location asks, switches to another, then removes it", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const home = path.basename(h.vault.dir);
    const other = path.join(path.dirname(h.vault.dir), "University");
    fs.mkdirSync(other);
    await h.page.getByTestId("wordmark-settings-button").click();
    await addLocation(h, other);
    const settings = h.page.getByRole("dialog", { name: "Settings" });
    await (await locationMenu(h, home)).getByTestId("location-remove").click();
    const ask = h.page.getByRole("alertdialog", { name: `Remove "${home}" from Boojy Notes?` });
    await expect(ask).toContainText('switch to "University"');
    await ask.getByRole("button", { name: "Remove and switch" }).click();
    await expect(h.page.getByTestId("vault-label")).toHaveText("University");
    await expect(settings.getByTestId("settings-location-row")).toHaveCount(1);
    expect(readConfig(h.userData)).toMatchObject({ notesDir: other, vaults: [other] });
    // Nothing on disk was touched.
    expect(fs.existsSync(h.vault.file("Alpha.md"))).toBe(true);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("pointing anywhere along a location's row, the empty stretch included, shows its ···", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.page.getByTestId("wordmark-settings-button").click();
    const home = path.basename(h.vault.dir);
    const row = location(h, home);
    const more = h.page.getByRole("button", { name: `${home} options` });
    // Transparent, not hidden, so Tab still reaches it.
    const opacity = () => more.evaluate((el) => getComputedStyle(el).opacity);
    await h.page.mouse.move(0, 0);
    await expect.poll(opacity).toBe("0");
    // Just left of the tick: nothing but the row itself.
    const tick = await row.getByTestId("location-current").boundingBox();
    if (!tick) throw new Error("row not laid out");
    await h.page.mouse.move(tick.x - 20, tick.y + tick.height / 2);
    await expect.poll(opacity).toBe("1");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Rename… names a location in the app alone; Escape keeps the old name; a blank name clears it", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const home = path.basename(h.vault.dir);
    const other = path.join(path.dirname(h.vault.dir), "University");
    fs.mkdirSync(other);
    await h.page.getByTestId("wordmark-settings-button").click();
    await addLocation(h, other);

    // Escape cancels, and the blur that follows saves nothing.
    await (await locationMenu(h, "University")).getByTestId("location-rename").click();
    const field = h.page.getByRole("textbox", { name: "Name for University in Boojy Notes" });
    await expect(field).toBeFocused();
    await expect(location(h, "University")).toContainText("The folder on disk keeps its name");
    await field.fill("Changed my mind");
    await field.press("Escape");
    await expect(h.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await expect(location(h, "University")).toBeVisible();
    expect(readConfig(h.userData).vaultLabels ?? {}).toEqual({});

    // Enter saves once; the row takes its A–Z place and keeps the keyboard.
    await (await locationMenu(h, "University")).getByTestId("location-rename").click();
    await field.fill("Aardvark");
    await field.press("Enter");
    await expect(location(h, "Aardvark")).toContainText("University");
    await expect(h.page.getByRole("button", { name: "Aardvark options" })).toBeFocused();
    const rows = h.page.getByTestId("settings-location-row");
    await expect(rows.first()).toHaveAttribute("data-location-path", other);
    expect(readConfig(h.userData).vaultLabels).toEqual({ [path.resolve(other)]: "Aardvark" });
    // The folder on disk keeps its name.
    expect(fs.existsSync(other)).toBe(true);

    // The open one is named too, in the sidebar and after a restart.
    await (await locationMenu(h, home)).getByTestId("location-rename").click();
    await h.page.getByRole("textbox", { name: `Name for ${home} in Boojy Notes` }).fill("Mine");
    await h.page.keyboard.press("Enter");
    await expect(h.page.getByTestId("vault-label")).toHaveText("Mine");
    await h.restart();
    await expect(h.page.getByTestId("vault-label")).toHaveText("Mine");

    // A blank name gives the folder's own name back.
    await h.page.getByTestId("wordmark-settings-button").click();
    await (await locationMenu(h, "Mine")).getByTestId("location-rename").click();
    await h.page.getByRole("textbox", { name: `Name for ${home} in Boojy Notes` }).fill("   ");
    await h.page.keyboard.press("Enter");
    await expect(h.page.getByTestId("vault-label")).toHaveText(home);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
