/**
 * What a click on a `[[wikilink]]` opens, and what it writes. Obsidian writes
 * three target forms beyond a plain name: `[[Note#Heading]]` (followed to the
 * heading: heading-links.spec.ts), `[[Note#^block]]` and `[[Folder/Note]]`.
 * Every one of them names a note
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
import {
  SETTLE_MS,
  editorTitle,
  expandAllFolders,
  launchApp,
  sleep,
  waitForFile,
  type AppHandle,
} from "./harness";

const link = (h: AppHandle, text: string) =>
  h.page
    .locator("[data-block-id] .wikilink")
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first();

test("a heading or block link opens the note it names and writes no file", async () => {
  const h = await launchApp({
    "Alpha.md": "See [[Beta#Intro]] and [[Beta#^ref]].\n",
    "Beta.md": "# Intro\n\nBeta body. ^ref\n",
  });
  try {
    await h.openNote("Alpha");
    // Both targets name a note that exists, so neither is broken.
    await expect(h.page.locator("[data-block-id] .wikilink")).toHaveCount(2);
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);

    await link(h, "Beta > Intro").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Beta");
    await h.openNote("Alpha");
    await link(h, "Beta > ^ref").click();
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

    for (const text of ["Work/Gamma", "Work/Gamma.md", "Work/Gamma > Plan"]) {
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
    await link(h, "Beta > Intro").click();
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

    // A heading this note lacks names no note: nothing to pick, so it says so.
    await link(h, "Intro").click();
    await expect(h.page.getByRole("alert")).toContainText("No heading “Intro” in this note.");
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

/**
 * A Markdown link whose destination is a path in the vault
 * (`[text](Folder/Note.md)`, the link most Markdown apps write for a note)
 * opens that note, by the path from the folder of the note it sits in and
 * then from the vault's root. It used to be handed to the system browser,
 * which refuses anything but http(s), so a click did nothing.
 */
test("a relative Markdown link opens the note or file its path names, and writes nothing", async () => {
  const alpha =
    "See [here](Gamma.md), [up](../Beta.md#Intro), [spaced](My%20Plan.md) and [gone](Nowhere.md).\n";
  const h = await launchApp({
    "Beta.md": "Top.\n\n# Intro\n\nBeta body.\n",
    "Work/Alpha.md": alpha,
    "Work/Gamma.md": "Gamma in Work.\n",
    "Gamma.md": "Gamma at the root.\n",
    "My Plan.md": "The plan.\n",
  });
  try {
    await expandAllFolders(h.page);
    const follow = async (text: string) => {
      await h.openNote("Alpha");
      await h.page.locator("[data-block-id] a", { hasText: text }).click();
    };
    // Two notes are called Gamma: the link sits in Work, so it names Work's.
    await follow("here");
    await expect.poll(() => editorTitle(h.page)).toBe("Gamma");
    await expect(h.page.locator("[data-block-id]").first()).toHaveText("Gamma in Work.");

    await follow("up");
    await expect.poll(() => editorTitle(h.page)).toBe("Beta");
    await follow("spaced");
    await expect.poll(() => editorTitle(h.page)).toBe("My Plan");

    // A path that names nothing says so and creates nothing.
    await follow("gone");
    await expect(h.page.getByText('No note or file at "Work/Nowhere.md"')).toHaveCount(0);
    await expect(h.page.getByText('No note or file at "Nowhere.md".')).toBeVisible();
    expect(await editorTitle(h.page)).toBe("Alpha");

    await sleep(SETTLE_MS);
    expect(h.vault.list().sort()).toEqual(
      ["Beta.md", "Gamma.md", "My Plan.md", "Work/Alpha.md", "Work/Gamma.md"].sort(),
    );
    expect(h.vault.read("Work/Alpha.md")).toBe(alpha);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
