/**
 * Storage locations: the sidebar's list is named after the open location's
 * folder, and its menu (a click on the name, or ⌘O) switches between them and
 * says what the tree shows besides notes; Settings adds, opens and removes. Files that are not notes open in their own app; the attachment store
 * is its own row, hidden until asked for.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

const readConfig = (userData: string) =>
  JSON.parse(fs.readFileSync(path.join(userData, "config.json"), "utf-8"));

/** Settings → Storage locations → Add folder…, answering the native picker with `dir`. */
async function addLocation(h: Awaited<ReturnType<typeof launchApp>>, dir: string) {
  await h.app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] });
  }, dir);
  await h.page.getByRole("button", { name: "Add folder…" }).click();
  await expect(
    h.page.getByRole("button", { name: new RegExp(`^${path.basename(dir)},`) }),
  ).toBeVisible();
}

test("a location added in Settings is listed without switching; Use and the menu switch", async () => {
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

    // Use, shown on the row's hover, switches at once, Settings staying open.
    const uni = settings.getByTestId("settings-location-row").filter({ hasText: "University" });
    await settings.getByRole("button", { name: /^University,/ }).hover();
    await settings.getByRole("button", { name: "Use University" }).click();
    await expect(label).toHaveText("University");
    await expect(uni.getByTestId("location-active")).toHaveText("Active");
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Timetable" })).toBeVisible();
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Alpha" })).toHaveCount(0);
    expect(readConfig(h.userData).notesDir).toBe(other);

    // The menu lists both in the order first opened, the open one checked, and switches back.
    await label.click();
    await expect(menu.getByRole("menuitemradio")).toHaveText([home, "University"]);
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
    await expect(
      h.page
        .getByRole("dialog", { name: "Settings" })
        .getByRole("button", { name: /^Old Journal,/ }),
    ).toContainText("Not found");
    await h.page.keyboard.press("Escape");

    const label = h.page.getByTestId("vault-label");
    await label.click();
    const row = h.page.getByRole("menuitemradio", { name: /Old Journal/ });
    await expect(row).toHaveAttribute("aria-disabled", "true");
    await expect(row).toContainText("Not found");
    await row.click({ force: true });
    await expect(label).toHaveText(path.basename(h.vault.dir));
    await h.page.keyboard.press("Escape");

    // Settings says so too, offers no Use, and removes it from the list after asking.
    await h.page.getByTestId("wordmark-settings-button").click();
    const settings = h.page.getByRole("dialog", { name: "Settings" });
    const old = settings.getByRole("button", { name: /^Old Journal,/ });
    await expect(old).toContainText("Not found");
    await expect(old).toHaveAttribute("aria-disabled", "true");
    await expect(settings.getByRole("button", { name: "Use Old Journal" })).toHaveCount(0);
    await old.hover();
    await settings.getByRole("button", { name: "Remove Old Journal from Boojy Notes" }).click();
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
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
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
    await settings.getByRole("button", { name: new RegExp(`^${home},`) }).hover();
    await settings.getByRole("button", { name: `Remove ${home} from Boojy Notes` }).click();
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
