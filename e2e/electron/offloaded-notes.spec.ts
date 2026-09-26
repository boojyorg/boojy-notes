/**
 * Notes a sync service keeps online (iCloud's Remove Download, Dropbox's
 * online-only): the file is there by name but its text is not on this Mac,
 * and reading it downloads it. The app lists such a note, greyed with a
 * cloud mark, never reads it until it is opened, and never writes one
 * without its text. `BOOJY_TEST_OFFLOADED` lists the paths the app is to
 * treat as offloaded (electron/offloaded.ts); a download takes a path off.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SETTLE_MS, launchApp, noteText, sleep, type Vault } from "./harness";

const BODY = "# Plans\n\nThe text that lives in the cloud.\n";

/** Launches with `offloaded` (vault-relative) marked as not on this Mac. */
async function launchOffloaded(files: Record<string, string>, offloaded: string[]) {
  let list = "";
  const h = await launchApp(files, {
    prepare: (vault: Vault) => {
      list = path.join(path.dirname(vault.dir), "offloaded.txt");
      fs.writeFileSync(list, offloaded.map((rel) => vault.file(rel)).join("\n"));
      process.env.BOOJY_TEST_OFFLOADED = list;
    },
  });
  delete process.env.BOOJY_TEST_OFFLOADED;
  const listed = () => fs.readFileSync(list, "utf-8").split("\n").filter(Boolean);
  const offload = (rel: string) =>
    fs.writeFileSync(list, [...listed(), h.vault.file(rel)].join("\n"));
  return { h, listed, offload };
}

const row = (h: { page: import("@playwright/test").Page }, title: string) =>
  h.page.locator("[data-note-id]").filter({ hasText: title });

test("an offloaded note is listed greyed with a cloud mark, and opening it downloads it", async () => {
  const { h, listed } = await launchOffloaded({ "Plans.md": BODY, "Local.md": "Here.\n" }, [
    "Plans.md",
  ]);
  try {
    await expect(row(h, "Plans").getByTestId("offloaded-mark")).toBeVisible();
    await expect(row(h, "Local").getByTestId("offloaded-mark")).toHaveCount(0);
    // Loading read nothing of it.
    expect(listed()).toHaveLength(1);

    await row(h, "Plans").click();
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toContain("lives in the cloud");
    await expect(row(h, "Plans").getByTestId("offloaded-mark")).toHaveCount(0);
    expect(listed()).toEqual([]);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Plans.md")).toBe(BODY);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("renaming an offloaded note keeps its text: it is downloaded, never written empty", async () => {
  const { h } = await launchOffloaded({ "Plans.md": BODY, "Local.md": "Here.\n" }, ["Plans.md"]);
  try {
    await h.openNote("Local");
    await row(h, "Plans").dblclick();
    const field = h.page.locator("[data-note-id] input");
    await field.fill("Plans 2027");
    await field.press("Enter");
    await expect
      .poll(() => h.vault.list().sort(), { timeout: 5_000 })
      .toEqual(["Local.md", "Plans 2027.md"]);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Plans 2027.md")).toBe(BODY);
    await expect(row(h, "Plans 2027").getByTestId("offloaded-mark")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note offloaded while the app runs is marked and not read; a new one arrives by name", async () => {
  const { h, listed, offload } = await launchOffloaded(
    { "Plans.md": BODY, "Local.md": "Here.\n" },
    [],
  );
  try {
    await h.openNote("Local");
    offload("Plans.md");
    // The eviction's own event: the file's metadata changes, its bytes do not.
    const now = new Date();
    fs.utimesSync(h.vault.file("Plans.md"), now, now);
    await expect(row(h, "Plans").getByTestId("offloaded-mark")).toBeVisible({ timeout: 5_000 });

    offload("Remote.md");
    h.vault.write("Remote.md", "Written on another Mac.\n");
    await expect(row(h, "Remote").getByTestId("offloaded-mark")).toBeVisible({ timeout: 5_000 });

    await sleep(SETTLE_MS);
    expect(listed()).toHaveLength(2);
    expect(h.vault.read("Plans.md")).toBe(BODY);

    await row(h, "Remote").click();
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toBe("Written on another Mac.");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a download that fails says so, and Try again brings the note", async () => {
  test.skip(process.platform === "win32", "permission bits");
  const { h } = await launchOffloaded({ "Plans.md": BODY, "Local.md": "Here.\n" }, ["Plans.md"]);
  try {
    await h.openNote("Local");
    fs.chmodSync(h.vault.file("Plans.md"), 0o000);
    await row(h, "Plans").click();
    const view = h.page.getByTestId("offloaded-note");
    await expect(view).toContainText("Couldn’t download this note");
    fs.chmodSync(h.vault.file("Plans.md"), 0o644);
    await view.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toContain("lives in the cloud");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Plans.md")).toBe(BODY);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
