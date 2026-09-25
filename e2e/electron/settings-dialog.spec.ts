/**
 * Settings on the desktop (2026-09-17): one pane on the palette's surface.
 * Storage locations: each row's name and place are its Show in Finder
 * control; Add folder… lists a folder without switching, and cancelling the
 * picker adds nothing. The appearance pills persist.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { appGround, launchApp } from "./harness";

const openSettings = async (h: Awaited<ReturnType<typeof launchApp>>) => {
  await h.page.getByTestId("wordmark-settings-button").click();
  const settings = h.page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  return settings;
};

test("the open location is marked Active; its name and place are the Show in Finder control", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const settings = await openSettings(h);
    const row = settings.getByTestId("settings-location-row");
    await expect(row.getByTestId("location-active")).toHaveText("Active");
    const reveal = settings.getByRole("button", {
      name: new RegExp(`^${path.basename(h.vault.dir)},`),
    });
    await expect(reveal).not.toHaveAttribute("title", /.*/);
    // Re-hovered until the chip shows: the Linux runner sends a stray mouseout
    // about half a second after a hover, which cancels the chip's rest timer.
    await expect(async () => {
      await reveal.hover();
      await expect(h.page.getByTestId("path-tooltip")).toHaveText(/Show in (Finder|folder)/, {
        timeout: 1_500,
      });
    }).toPass({ timeout: 10_000 });
    // The only location: nothing to switch to, so no ×.
    await expect(settings.getByRole("button", { name: /^Remove / })).toHaveCount(0);
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
    await expect(settings.getByRole("button", { name: "Use Other" })).toBeAttached();
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
