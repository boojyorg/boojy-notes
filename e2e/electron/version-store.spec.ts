/**
 * Version history's store: what makes a version, from the outside. ⌘S keeps
 * the note as a save point and its receipt names it; leaving a note ends its
 * writing session with an Autosave; an edit from outside keeps the text it
 * replaced; all of it survives a restart. Needs the real app: versions are
 * taken at the write seam in the main process, from the bytes on disk, across
 * the write debounce, the watcher and a relaunch.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  MOD,
  type AppHandle,
  launchApp,
  menuClick,
  noteText,
  sleep,
  waitForFile,
} from "./harness";

interface Version {
  id: string;
  kind: "auto" | "point";
  name?: string;
  reason?: string;
}

async function noteId(h: AppHandle, title: string): Promise<string> {
  const id = await h.page
    .locator("[data-note-id]")
    .filter({ hasText: title })
    .first()
    .getAttribute("data-note-id");
  if (!id) throw new Error(`no row for ${title}`);
  return id;
}

function versions(h: AppHandle, id: string): Promise<Version[]> {
  return h.page.evaluate(
    async (id) => (await window.electronAPI!.history.list(id)).versions,
    id,
  ) as Promise<Version[]>;
}

function versionText(h: AppHandle, id: string, versionId: string): Promise<string | null> {
  return h.page.evaluate(([id, v]) => window.electronAPI!.history.read(id, v), [
    id,
    versionId,
  ] as const);
}

async function typeAtEnd(h: AppHandle, text: string) {
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(text);
}

test("⌘S keeps the note as a save point, named from its receipt, and it survives a restart", async () => {
  const h = await launchApp({ "Essay.md": "First line.\n" });
  try {
    await h.openNote("Essay");
    const id = await noteId(h, "Essay");
    await typeAtEnd(h, " More.");
    await h.page.keyboard.press(`${MOD}+s`);

    const toast = h.page.locator("[data-toast-kind]");
    await expect(toast).toContainText("Save point");
    expect(await toast.locator("svg.lucide-history").count()).toBe(1);
    // The unsaved typing was written first: the save point holds it.
    await expect.poll(async () => (await versions(h, id))[0]?.kind).toBe("point");
    const [point] = await versions(h, id);
    expect(await versionText(h, id, point.id)).toBe("First line. More.\n");

    // ⌘S again while the receipt shows opens its name field.
    await h.page.keyboard.press(`${MOD}+s`);
    const field = toast.getByRole("textbox", { name: "Save point name" });
    await expect(field).toBeFocused();
    await h.page.keyboard.type("Before tutor");
    await h.page.keyboard.press("Enter");
    await expect(toast).toContainText("Before tutor");
    await expect.poll(async () => (await versions(h, id))[0]?.name).toBe("Before tutor");
    // The keys go back to the note, where the caret was.
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file("Essay.md"), (t) => t === "First line. More.!\n");

    // Nothing new since a save point: said, not saved again.
    await expect(toast).toHaveCount(0, { timeout: 8_000 });
    await menuClick(h, "savePoint");
    await expect.poll(async () => (await versions(h, id))[0]?.kind).toBe("point");
    // Once its receipt has gone, ⌘S with nothing new says so, and keeps nothing.
    await expect(toast).toHaveCount(0, { timeout: 8_000 });
    const count = (await versions(h, id)).length;
    await menuClick(h, "savePoint");
    await expect(toast).toContainText("Nothing new since the last save point");
    expect(await versions(h, id)).toHaveLength(count);

    const before = await versions(h, id);
    await h.restart();
    expect(await versions(h, id)).toEqual(before);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("clicking the receipt's words names the save point", async () => {
  const h = await launchApp({ "Essay.md": "Text.\n" });
  try {
    await h.openNote("Essay");
    const id = await noteId(h, "Essay");
    await typeAtEnd(h, " Added.");
    await h.page.keyboard.press(`${MOD}+s`);
    await h.page.getByRole("button", { name: "Save point. Name this save point" }).click();
    await h.page.keyboard.type("Submitted v1");
    await h.page.keyboard.press("Enter");
    await expect.poll(async () => (await versions(h, id))[0]?.name).toBe("Submitted v1");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("leaving a note ends its writing session with an Autosave", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n", "Beta.md": "Beta.\n" });
  try {
    await h.openNote("Alpha");
    const id = await noteId(h, "Alpha");
    await typeAtEnd(h, " Edited.");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("Edited."));
    await h.openNote("Beta");
    // The session ends once the leaving write has had time to land.
    await expect
      .poll(async () => (await versions(h, id)).map((v) => v.kind), { timeout: 8_000 })
      .toEqual(["auto", "auto"]);
    const [session, before] = await versions(h, id);
    expect(await versionText(h, id, session.id)).toBe("Alpha. Edited.\n");
    // The note as it was before the app first touched it.
    expect(await versionText(h, id, before.id)).toBe("Alpha.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an edit from outside keeps the text it replaced", async () => {
  const h = await launchApp({ "Alpha.md": "Mine.\n" });
  try {
    await h.openNote("Alpha");
    const id = await noteId(h, "Alpha");
    h.vault.write("Alpha.md", "Theirs, from another device.\n");
    await expect
      .poll(() => noteText(h.page), { timeout: 5_000 })
      .toBe("Theirs, from another device.");
    const [v] = await versions(h, id);
    expect(v.reason).toBe("Before an outside change");
    expect(await versionText(h, id, v.id)).toBe("Mine.\n");
    await sleep(300);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
