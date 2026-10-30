/**
 * A note whose file is in none of the storage locations, opened from Finder
 * (electron/outsideNotes.ts): edited and renamed in place, its outside edits
 * taken as a location's are (keep both while typing), its pictures read beside
 * it and nowhere else, and never listed, searched, tagged or linked.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { PNG, PNG_B64 } from "../fixtures";
import {
  type AppHandle,
  dropFiles,
  END_OF_LINE,
  launchApp,
  MOD,
  noteText,
  SETTLE_MS,
  sleep,
  waitForFile,
} from "./harness";

const TODAY = new Date().toISOString().slice(0, 10);
const title = (page: Page) => page.getByRole("textbox", { name: "Note title" });
const toast = (h: AppHandle) => h.page.locator("[data-toast-kind]");

/** Finder's Open With, as macOS sends it to the running app. */
const openFile = (h: AppHandle, file: string) =>
  h.app.evaluate(({ app }, p) => {
    app.emit("open-file", { preventDefault() {} }, p);
  }, file);

/** A folder beside the vault, as Downloads is: `name` → text. */
function outsideFolder(h: AppHandle, files: Record<string, string>) {
  const dir = path.join(h.root, "Downloads");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return { dir, file: (name: string) => path.join(dir, name) };
}

/** Open `file` from Finder and put the caret at the end of its first block, saved. */
async function openAndPlace(h: AppHandle, file: string, name: string) {
  await openFile(h, file);
  await expect(title(h.page)).toHaveText(name);
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await sleep(SETTLE_MS);
}

test("an outside file opens in place: its folder in the path, typed edits and a rename land in that folder", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    const out = outsideFolder(h, { "Loose.md": "Loose words.\n" });
    await openAndPlace(h, out.file("Loose.md"), "Loose");
    await expect(h.page.getByTestId("note-path-outside")).toHaveText("Downloads");
    await expect(h.page.getByTestId("note-path-root")).toHaveCount(0);

    await h.page.keyboard.type(" More.");
    await waitForFile(out.file("Loose.md"), (t) => t === "Loose words. More.\n");

    // Renamed from its name in the path: the file moves within its folder.
    await title(h.page).click();
    await h.page.keyboard.press(`${MOD}+A`);
    await h.page.keyboard.type("Kept");
    await h.page.keyboard.press("Enter");
    await waitForFile(out.file("Kept.md"), (t) => t === "Loose words. More.\n");
    expect(fs.existsSync(out.file("Loose.md"))).toBe(false);
    expect(fs.readdirSync(out.dir).sort()).toEqual(["Kept.md"]);
    // Nothing of it was written into the vault.
    expect(h.vault.list().filter((f) => f.endsWith(".md"))).toEqual(["Inbox.md"]);

    // Its ··· keeps what acts on the file in place; Version History says why it is greyed.
    await h.page.locator("button[aria-label='Note actions']").click();
    const menu = h.page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: /Version History/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(menu).toContainText("Not kept for this file");
    for (const gone of ["Duplicate", "Move to…", "Delete"])
      await expect(menu.getByRole("menuitem", { name: gone, exact: true })).toHaveCount(0);
    await h.page.keyboard.press("Escape");

    // Asked for again, it is the same note: one file, the text once.
    await openFile(h, out.file("Kept.md"));
    await expect(title(h.page)).toHaveText("Kept");
    expect(fs.readdirSync(out.dir)).toEqual(["Kept.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an outside file is in no list: the sidebar, search, tags, links, the link picker and Recent", async () => {
  const h = await launchApp({ "Inbox.md": "See [[Loose]].\n", "Other.md": "Other.\n" });
  try {
    const out = outsideFolder(h, { "Loose.md": "Zanzibarword #outsidetag\n" });
    await h.openNote("Other");
    await openFile(h, out.file("Loose.md"));
    await expect(title(h.page)).toHaveText("Loose");

    await expect(h.page.getByRole("treeitem").filter({ hasText: "Loose" })).toHaveCount(0);

    await h.openNote("Inbox");
    // The link names no note of the location's: drawn unresolved.
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(1);

    await h.page.keyboard.press(`${MOD}+P`);
    const dialog = h.page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    // Recent: Other, not the outside note opened since.
    await expect(dialog.locator("[data-search-index]")).toHaveText([/Other/]);
    await h.page.keyboard.type("Zanzibarword");
    await sleep(400);
    await expect(dialog.locator("[data-search-index]").filter({ hasText: "Loose" })).toHaveCount(0);
    await h.page.keyboard.press(`${MOD}+A`);
    await h.page.keyboard.type("#");
    await expect(dialog).not.toContainText("outsidetag");
    await h.page.keyboard.press("Escape");

    // The [[ picker offers the location's notes only.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" [[Loo");
    const picker = h.page.getByRole("dialog").filter({ hasText: "Create note" });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("option").filter({ hasText: /^Loose$/ })).toHaveCount(0);
    await h.page.keyboard.press("Escape");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an outside edit is taken while idle, kept both ways while typing, and a replace-style save is seen", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    const out = outsideFolder(h, { "Draft.md": "Draft.\n" });
    await openAndPlace(h, out.file("Draft.md"), "Draft");

    fs.writeFileSync(out.file("Draft.md"), "Draft, edited outside.\n");
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toContain("edited outside");

    // An editor's save by replacement: a new file renamed over the old.
    fs.writeFileSync(out.file(".Draft.md.tmp"), "Draft, replaced.\n");
    fs.renameSync(out.file(".Draft.md.tmp"), out.file("Draft.md"));
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toContain("replaced");

    // Typing, and the file changes under it: the outside version keeps the
    // name, the typing goes on in a copy beside it.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" mine");
    fs.writeFileSync(out.file("Draft.md"), "Theirs.\n");
    const copy = `Draft (conflicted copy ${TODAY})`;
    await expect(title(h.page)).toHaveText(copy, { timeout: 5_000 });
    await waitForFile(out.file(`${copy}.md`), (t) => t.includes("mine"));
    await sleep(SETTLE_MS);
    expect(fs.readFileSync(out.file("Draft.md"), "utf8")).toBe("Theirs.\n");
    expect(fs.readFileSync(out.file(`${copy}.md`), "utf8")).toBe("Draft, replaced. mine\n");
    await expect(h.page.getByTestId("note-path-outside")).toHaveText("Downloads");
    expect(h.vault.list().filter((f) => f.endsWith(".md"))).toEqual(["Inbox.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("renamed in Finder it follows; deleted with nothing pending it closes and says so", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    const out = outsideFolder(h, { "Old.md": "Words.\n" });
    await openAndPlace(h, out.file("Old.md"), "Old");

    fs.renameSync(out.file("Old.md"), out.file("New.md"));
    await expect(title(h.page)).toHaveText("New", { timeout: 5_000 });
    await h.page.keyboard.type(" typed");
    await waitForFile(out.file("New.md"), (t) => t === "Words. typed\n");
    expect(fs.existsSync(out.file("Old.md"))).toBe(false);

    await sleep(SETTLE_MS);
    fs.rmSync(out.file("New.md"));
    await expect(toast(h)).toHaveText(
      `"New" was deleted or moved outside Boojy Notes, so it was closed.`,
      { timeout: 5_000 },
    );
    await expect(title(h.page)).not.toHaveText("New");
    // Nothing made it again, and the app trashed nothing of its own.
    await sleep(SETTLE_MS);
    expect(fs.readdirSync(out.dir)).toEqual([]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("deleted with edits pending, the edits are written back to it", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    const out = outsideFolder(h, { "Keep.md": "Words.\n" });
    await openAndPlace(h, out.file("Keep.md"), "Keep");
    await h.page.keyboard.type(" unsaved");
    fs.rmSync(out.file("Keep.md"));
    await expect(toast(h)).toHaveText(
      `"Keep" was deleted or moved outside Boojy Notes. Your unsaved edits were written back to it.`,
      { timeout: 5_000 },
    );
    await waitForFile(out.file("Keep.md"), (t) => t === "Words. unsaved\n");
    await expect(title(h.page)).toHaveText("Keep");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a conflict copy that cannot be written keeps the edits here and says so, then is written", async () => {
  test.skip(process.platform === "win32", "a folder's write permission is POSIX here");
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    const out = outsideFolder(h, { "Locked.md": "Words.\n" });
    await openAndPlace(h, out.file("Locked.md"), "Locked");
    await h.page.keyboard.type(" mine");
    fs.writeFileSync(out.file("Locked.md"), "Theirs.\n");
    // The folder takes no new file: the copy cannot be made beside it.
    fs.chmodSync(out.dir, 0o555);
    await expect(toast(h)).toContainText("could not be saved as a copy", { timeout: 8_000 });
    expect(fs.readFileSync(out.file("Locked.md"), "utf8")).toBe("Theirs.\n");
    await expect.poll(() => noteText(h.page)).toContain("mine");

    fs.chmodSync(out.dir, 0o755);
    const copy = `Locked (conflicted copy ${TODAY})`;
    await waitForFile(out.file(`${copy}.md`), (t) => t.includes("mine"), { timeout: 12_000 });
    expect(fs.readFileSync(out.file("Locked.md"), "utf8")).toBe("Theirs.\n");
    expect(h.pageErrors.filter((e) => !e.includes("conflict copy write failed"))).toEqual([]);
  } finally {
    try {
      fs.chmodSync(path.join(h.root, "Downloads"), 0o755);
    } catch {}
    await h.close();
  }
});

test("renamed in Finder before its pending save, the save follows the file and never makes the old name again", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    const out = outsideFolder(h, { "Loose.md": "Words.\n" });
    await openAndPlace(h, out.file("Loose.md"), "Loose");
    await h.page.keyboard.type(" typed");
    // Just before the save fires (the text commit's 300 ms, then the write's
    // 500), so it lands before the folder watch has settled on the rename
    // (300 ms after it). With the fix either order passes; this one is the race.
    await sleep(650);
    fs.renameSync(out.file("Loose.md"), out.file("Renamed.md"));
    await waitForFile(out.file("Renamed.md"), (t) => t === "Words. typed\n");
    await expect(title(h.page)).toHaveText("Renamed", { timeout: 5_000 });
    // Typing on: still the renamed file, under its new name.
    await h.page.keyboard.type(" more");
    await waitForFile(out.file("Renamed.md"), (t) => t === "Words. typed more\n");
    await sleep(SETTLE_MS);
    expect(fs.readdirSync(out.dir)).toEqual(["Renamed.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("after a reload (a new window), the same file opened again shows its text", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    const out = outsideFolder(h, { "Again.md": "Still here.\n" });
    await openFile(h, out.file("Again.md"));
    await expect(title(h.page)).toHaveText("Again");
    await h.page.reload();
    await expect(h.page.getByRole("treeitem").first()).toBeVisible();
    await openFile(h, out.file("Again.md"));
    await expect(title(h.page)).toHaveText("Again");
    await expect.poll(() => noteText(h.page)).toContain("Still here.");
  } finally {
    await h.close();
  }
});

test("a picture dropped or pasted into it is refused with a notice, and nothing is saved anywhere", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    const out = outsideFolder(h, { "Plain.md": "One\n\nTwo\n" });
    await openAndPlace(h, out.file("Plain.md"), "Plain");
    const two = await h.page.locator('[data-block-type="p"]', { hasText: "Two" }).boundingBox();
    await dropFiles(
      h.page,
      [{ name: "Dropped.png", bytes: Buffer.from(PNG_B64, "base64") }],
      two!.x + 20,
      two!.y + 2,
    );
    await expect(toast(h)).toHaveText(
      "Pictures and files can't be added to a note outside your storage locations yet.",
    );
    await h.page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "Pasted.png", { type: "image/png" }));
      const target = document.getSelection()?.anchorNode?.parentElement ?? document.body;
      target.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, PNG_B64);
    await sleep(SETTLE_MS);
    expect(h.vault.list().filter((f) => !f.endsWith(".md"))).toEqual([]);
    expect(fs.readdirSync(out.dir)).toEqual(["Plain.md"]);
    expect(fs.readFileSync(out.file("Plain.md"), "utf8")).toBe("One\n\nTwo\n");
    await expect(h.page.locator('[data-block-type="image"]')).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("pictures beside it draw; one reached by .. or a symlink out of its folder never loads", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    fs.writeFileSync(path.join(h.root, "secret.png"), PNG);
    const out = outsideFolder(h, {
      "Pics.md": "One\n\n![](pics/here.png)\n\n![](../secret.png)\n\n![](linked.png)\n",
    });
    fs.mkdirSync(path.join(out.dir, "pics"));
    fs.writeFileSync(path.join(out.dir, "pics", "here.png"), PNG);
    fs.symlinkSync(path.join(h.root, "secret.png"), out.file("linked.png"));
    await openFile(h, out.file("Pics.md"));
    await expect(title(h.page)).toHaveText("Pics");

    // The picture beside it draws; the two that would leave its folder are
    // refused, and their blocks say Not found, as a missing picture's does.
    const blocks = h.page.locator('[data-block-type="image"]');
    await expect
      .poll(() =>
        blocks
          .nth(0)
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    await expect(blocks.nth(1).getByTestId("missing-attachment")).toBeVisible();
    await expect(blocks.nth(2).getByTestId("missing-attachment")).toBeVisible();
    // Asked for directly, as an <img> asks: served from inside the folder only.
    const loads = (p: string) =>
      h.page.evaluate(
        (u) =>
          new Promise<boolean>((done) => {
            const img = new Image();
            img.onload = () => done(true);
            img.onerror = () => done(false);
            img.src = u;
          }),
        `boojy-att://outside/${encodeURIComponent(p)}`,
      );
    expect(await loads(path.join(out.dir, "pics", "here.png"))).toBe(true);
    expect(await loads(path.join(out.dir, "..", "secret.png"))).toBe(false);
    expect(await loads(out.file("linked.png"))).toBe(false);
    expect(await loads(path.join(h.root, "secret.png"))).toBe(false);
  } finally {
    await h.close();
  }
});
