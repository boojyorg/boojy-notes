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
 * is what the click does. Creating a note on click is kept for the ordinary
 * case, a plain name no note has; a target whose form the app cannot fully
 * honour never creates anything, it says so and the link's bytes stay as
 * written.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, editorTitle, launchApp, sleep, waitForFile } from "./harness";

const link = (h: Awaited<ReturnType<typeof launchApp>>, text: string) =>
  h.page.locator("[data-block-id] .wikilink").filter({ hasText: text }).first();

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

test("a plain link to a note that does not exist still creates it", async () => {
  const h = await launchApp({ "Alpha.md": "See [[Delta]].\n" });
  try {
    await h.openNote("Alpha");
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(1);
    await link(h, "Delta").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Delta");
    await waitForFile(h.vault.file("Delta.md"), () => true);
    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(["Alpha.md", "Delta.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an unsupported target whose note is missing writes nothing and says so", async () => {
  const h = await launchApp({
    "Alpha.md": "See [[Beta#Intro]], [[Work/Gamma]] and [[#Intro]].\n",
    // A Gamma exists, at the root: the explicit path says Work, so it is not this one.
    "Gamma.md": "Not the one.\n",
  });
  try {
    await h.openNote("Alpha");
    await expect(h.page.locator("[data-block-id] .wikilink")).toHaveCount(3);
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(2);

    await link(h, "Beta#Intro").click();
    await expect(h.page.getByRole("alert")).toContainText('No note named "Beta"');
    await expect.poll(() => editorTitle(h.page)).toBe("Alpha");

    await link(h, "Work/Gamma").click();
    await expect(h.page.getByRole("alert").last()).toContainText('No note named "Gamma" in Work');
    await expect.poll(() => editorTitle(h.page)).toBe("Alpha");

    await link(h, "#Intro").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Alpha");

    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(["Alpha.md", "Gamma.md"]);
    expect(h.vault.read("Alpha.md")).toBe("See [[Beta#Intro]], [[Work/Gamma]] and [[#Intro]].\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
