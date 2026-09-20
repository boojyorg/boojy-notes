/**
 * What a click on a `[[wikilink]]` opens, and what it writes. Obsidian writes
 * three target forms this editor does not fully support: `[[Note#Heading]]`,
 * `[[Note#^block]]` and `[[Folder/Note]]`. Every one of them names a note
 * that may well exist, and a click used to match the whole target against
 * titles, fail, and create a note called `Beta#Intro` or `Work/Gamma`, which
 * the filename rules wrote as `Beta#Intro.md` and `Work_Gamma.md` in the
 * vault root (reproduced 2026-09-15 on a copy of Tyr's Obsidian vault).
 * Obsidian refuses both names.
 *
 * The rule now: a target is resolved by the note it names (the part before
 * `#`, in the folder its path gives when it gives one), and opening that note
 * is what the click does. A plain name no note has used to be created on
 * click; since 2026-09-20 the click opens the link picker on the link with
 * Create note as its first row, and nothing is made until it is chosen. A
 * target whose form the app cannot fully honour never creates anything, it
 * says so and the link's bytes stay as written.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, editorTitle, launchApp, sleep, waitForFile } from "./harness";

const link = (h: Awaited<ReturnType<typeof launchApp>>, text: string) =>
  h.page
    .locator("[data-block-id] .wikilink")
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first();

test("a heading link opens the note it names and writes no file", async () => {
  const h = await launchApp({
    "Alpha.md": "See [[Beta#Intro]] and [[Beta#^ref]].\n",
    "Beta.md": "# Intro\n\nBeta body. ^ref\n",
  });
  try {
    await h.openNote("Alpha");
    // Both targets name a note that exists, so neither is broken.
    await expect(h.page.locator("[data-block-id] .wikilink")).toHaveCount(2);
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);

    await link(h, "Beta#Intro").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Beta");
    await h.openNote("Alpha");
    await link(h, "Beta#^ref").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Beta");

    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(["Alpha.md", "Beta.md"]);
    expect(h.vault.read("Alpha.md")).toBe("See [[Beta#Intro]] and [[Beta#^ref]].\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a folder-path link opens the note at that path and writes no file", async () => {
  const h = await launchApp({
    "Alpha.md": "See [[Work/Gamma]] and [[Work/Gamma.md]] and [[Work/Gamma#Plan]].\n",
    "Work/Gamma.md": "# Plan\n\nGamma body.\n",
  });
  try {
    await h.openNote("Alpha");
    await expect(h.page.locator("[data-block-id] .wikilink")).toHaveCount(3);
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);

    for (const text of ["Work/Gamma", "Work/Gamma.md", "Work/Gamma#Plan"]) {
      await link(h, text).click();
      await expect.poll(() => editorTitle(h.page)).toBe("Gamma");
      await h.openNote("Alpha");
    }

    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(["Alpha.md", "Work/Gamma.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a plain link to a note that does not exist asks, and creates only when Create is chosen", async () => {
  const h = await launchApp({ "Alpha.md": "See [[Delta]].\n" });
  try {
    await h.openNote("Alpha");
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(1);
    await link(h, "Delta").click();
    const picker = h.page.getByTestId("link-picker");
    await expect(picker).toBeVisible();
    await expect(picker.getByTestId("link-row-create")).toHaveText("Create note “Delta”");
    // Escape: nothing made, nothing opened.
    await h.page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(["Alpha.md"]);
    expect(await editorTitle(h.page)).toBe("Alpha");

    await link(h, "Delta").click();
    await picker.getByTestId("link-row-create").click();
    await expect(picker).toHaveCount(0);
    await waitForFile(h.vault.file("Delta.md"), () => true);
    // Made beside this note, linked, and the reader stays here.
    expect(await editorTitle(h.page)).toBe("Alpha");
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);
    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(["Alpha.md", "Delta.md"]);
    expect(h.vault.read("Alpha.md")).toBe("See [[Delta]].\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a heading or path target whose note is missing asks by the note's name; a same-note heading only says so", async () => {
  const h = await launchApp({
    "Alpha.md": "See [[Beta#Intro]], [[Work/Gamma]] and [[#Intro]].\n",
    // A Gamma exists, at the root: the explicit path says Work, so it is not this one.
    "Gamma.md": "Not the one.\n",
  });
  try {
    await h.openNote("Alpha");
    await expect(h.page.locator("[data-block-id] .wikilink")).toHaveCount(3);
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(2);
    const picker = h.page.getByTestId("link-picker");
    const rows = () =>
      picker
        .locator('[role="option"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ")));

    // The picker searches by the name, never the path: Create for Beta.
    await link(h, "Beta#Intro").click();
    await expect(picker).toBeVisible();
    await expect(picker.getByLabel("Text")).toBeFocused();
    expect(await rows()).toEqual(["Create note “Beta”"]);
    await h.page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect.poll(() => editorTitle(h.page)).toBe("Alpha");

    // A stale path: the Gamma there is, offered rather than guessed.
    await link(h, "Work/Gamma").click();
    await expect(picker).toBeVisible();
    expect(await rows()).toEqual(["Gamma Notes"]);
    await h.page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);

    // A heading in this note names no note: nothing to pick, so it says so.
    await link(h, "#Intro").click();
    await expect(h.page.getByRole("alert")).toContainText("heading in this note");
    await expect(picker).toHaveCount(0);
    await expect.poll(() => editorTitle(h.page)).toBe("Alpha");

    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(["Alpha.md", "Gamma.md"]);
    expect(h.vault.read("Alpha.md")).toBe("See [[Beta#Intro]], [[Work/Gamma]] and [[#Intro]].\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
