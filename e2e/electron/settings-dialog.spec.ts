/**
 * Settings on the desktop (2026-09-17): one pane on the palette's surface.
 * The notes-folder path is the Show in Finder control and Change folder…
 * asks first, saying the current notes stay where they are; cancelling the
 * question or the picker changes nothing. The appearance pills persist.
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

test("the path is the Show in Finder control, named by a chip after the rest, and Change folder… asks first", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const settings = await openSettings(h);
    const pathControl = settings.getByRole("button", { name: /Show in Finder|Show in folder/ });
    await expect(pathControl).toHaveText(new RegExp(path.basename(h.vault.dir) + "$"));
    await expect(pathControl).not.toHaveAttribute("title", /.*/);
    // Re-hovered until the chip shows: the Linux runner sends a stray mouseout
    // about half a second after a hover, which cancels the chip's rest timer.
    await expect(async () => {
      await pathControl.hover();
      await expect(h.page.getByTestId("path-tooltip")).toHaveText(/Show in (Finder|folder)/, {
        timeout: 1_500,
      });
    }).toPass({ timeout: 10_000 });

    // Change folder… explains before the picker.
    await settings.getByRole("button", { name: "Change folder…" }).click();
    const ask = h.page.getByRole("alertdialog", { name: "Change notes folder?" });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText("Your current notes will stay where they are.");
    await expect(ask.getByRole("button", { name: "Choose folder…" })).toBeFocused();
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(ask).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(pathControl).toHaveText(new RegExp(path.basename(h.vault.dir) + "$"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("cancelling the picker after the question keeps the folder; choosing one switches", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const other = path.join(path.dirname(h.vault.dir), "Other");
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, "Elsewhere.md"), "Other vault.\n");
    await h.app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    const settings = await openSettings(h);
    await settings.getByRole("button", { name: "Change folder…" }).click();
    await h.page.getByRole("alertdialog").getByRole("button", { name: "Choose folder…" }).click();
    await expect(h.page.getByRole("alertdialog")).toHaveCount(0);
    await expect(settings.getByTestId("notes-folder-path")).toHaveText(
      new RegExp(path.basename(h.vault.dir) + "$"),
    );
    const config = JSON.parse(fs.readFileSync(path.join(h.userData, "config.json"), "utf-8"));
    expect(config.notesDir).toBe(h.vault.dir);

    await h.app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, other);
    await settings.getByRole("button", { name: "Change folder…" }).click();
    await h.page.getByRole("alertdialog").getByRole("button", { name: "Choose folder…" }).click();
    await expect(settings.getByTestId("notes-folder-path")).toHaveText(/Other$/);
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Elsewhere" })).toBeVisible();
    // Nothing moved: Alpha is still where it was.
    expect(fs.existsSync(h.vault.file("Alpha.md"))).toBe(true);
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
