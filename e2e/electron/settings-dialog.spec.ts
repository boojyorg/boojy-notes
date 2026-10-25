/**
 * Settings on the desktop (2026-09-17): one pane on the palette's surface.
 * Storage locations: each row's name and place are its Show in Finder
 * control; Add folder… lists a folder without switching, and cancelling the
 * picker adds nothing. The appearance pills persist.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { appGround, launchApp, type AppHandle } from "./harness";

const openSettings = async (h: AppHandle) => {
  await h.page.getByTestId("wordmark-settings-button").click();
  const settings = h.page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  return settings;
};

test("the open location is ticked; its ··· menu leaves out what cannot work", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const settings = await openSettings(h);
    const row = settings.getByTestId("settings-location-row");
    await expect(row.getByTestId("location-current").locator("svg")).toBeVisible();
    await expect(row).toContainText(path.basename(h.vault.dir));
    const more = settings.getByRole("button", { name: `${path.basename(h.vault.dir)} options` });
    await row.hover();
    await more.click();
    const menu = h.page.getByTestId("location-menu");
    // The only location, and the open one: nothing to switch to, nothing to remove.
    await expect(menu.getByRole("menuitem")).toHaveText(["Rename…", /Show in (Finder|folder)/]);
    // At once, before focus has reached the menu: the menu's Escape, not Settings'.
    await h.page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(settings).toBeVisible();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("cancelling Add folder… adds nothing; choosing one lists it and switches nothing", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const other = path.join(path.dirname(h.vault.dir), "Other");
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, "Elsewhere.md"), "Other vault.\n");
    await h.app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    const settings = await openSettings(h);
    const rows = settings.getByTestId("settings-location-row");
    await settings.getByRole("button", { name: "Add folder…" }).click();
    await expect(rows).toHaveCount(1);

    await h.app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, other);
    await settings.getByRole("button", { name: "Add folder…" }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Other" }).getByTestId("location-current")).toHaveCount(0);
    const config = JSON.parse(fs.readFileSync(path.join(h.userData, "config.json"), "utf-8"));
    expect(config.notesDir).toBe(h.vault.dir);
    expect(config.vaults).toEqual([h.vault.dir, other]);
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Alpha" })).toBeVisible();
    // Nothing moved.
    expect(fs.existsSync(path.join(other, "Alpha.md"))).toBe(false);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the appearance pills switch the theme live and persist; the switch and update button are there", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const settings = await openSettings(h);
    const ground = () => appGround(h.page);
    await expect(settings.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await settings.getByRole("radio", { name: "Dark" }).click();
    await expect.poll(ground).toBe("rgb(28, 28, 28)");
    await expect(settings.getByRole("switch", { name: "Automatic updates" })).toBeVisible();
    await expect(settings.getByRole("button", { name: "Check for updates" })).toBeVisible();
    await expect(settings).toContainText(/Boojy Notes v\d+\.\d+\.\d+/);
    await h.page.keyboard.press("Escape");
    await h.restart();
    await expect.poll(ground).toBe("rgb(28, 28, 28)");
    const again = await openSettings(h);
    await expect(again.getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// Menus, dialogs and full screen's title strip are drawn by the system: they
// take the app's theme, not the Mac's (a dark app wore a light strip).
test("the system's own surfaces take the app's theme", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const source = () => h.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
    await expect.poll(source).toBe("light");
    const settings = await openSettings(h);
    for (const [pill, expected] of [
      ["Dark", "dark"],
      ["System", "system"],
      ["Light", "light"],
    ]) {
      await settings.getByRole("radio", { name: pill }).click();
      await expect.poll(source).toBe(expected);
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// Escape is a key, so Chromium would ring whatever focus goes back to: a
// clicked wordmark lit up as Settings closed. Focus goes back ringed only if
// it was ringed when Settings opened.
test("closing Settings hands focus back with a ring only if it had one", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const wordmark = h.page.getByTestId("wordmark-settings-button");
    const ringed = () => wordmark.evaluate((el) => el.matches(":focus-visible"));

    // Settings takes focus a frame after it opens; an Escape before then
    // would be pressed on the wordmark itself.
    const settings = await openSettings(h);
    await expect(settings).toBeFocused();
    await h.page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(wordmark).toBeFocused();
    expect(await ringed()).toBe(false);

    // Reached by keyboard (a key, then focus moved in script, standing in for
    // Tab): the ring is the user's place, and it comes back with them. A
    // modifier alone is not keyboard use to Chromium.
    await h.page.keyboard.press("Escape");
    await wordmark.evaluate((el: HTMLElement) => {
      el.blur();
      el.focus();
    });
    expect(await ringed()).toBe(true);
    await h.page.keyboard.press("Enter");
    await expect(settings).toBeFocused();
    await h.page.keyboard.press("Escape");
    await expect(wordmark).toBeFocused();
    expect(await ringed()).toBe(true);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
