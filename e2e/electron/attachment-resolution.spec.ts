/**
 * An embed's file is found where Obsidian finds it (`src/utils/attachmentPath.ts`):
 * the path as written, the note's own folder, then by name anywhere, the
 * shortest path first. Each case below is the copy Obsidian itself drew for
 * the same vault (2026-10-26); its two ties went by Obsidian's own file
 * order, so here they go A–Z. The note's bytes never change, a file that
 * arrives later shows without a reopen, and every action reaches the file
 * drawn.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  SETTLE_MS,
  dropFiles,
  expandAllFolders,
  launchApp,
  moveNoteToFolder,
  sleep,
} from "./harness";
import { makePdf } from "./pdfFixture";

/** A picture that says where it is. */
const svg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text y="30">${label}</text></svg>`;

const FILES = [
  "Notes/pic1.svg",
  "pic1.svg",
  "pic2.svg",
  "attachments/pic2.svg",
  "Alpha/Deep/pic3.svg",
  "Zeta/pic3.svg",
  "Zulu/pic3b.svg",
  "Bravo/x/y/pic3b.svg",
  "Notes/pic4.svg",
  "Other/pic4.svg",
  "Aaa/pic4b.svg",
  "Notes/Sib/pic4b.svg",
  "Other/img/pic5.svg",
  "pic5.svg",
  "img/pic6.svg",
  "Notes/pic six.svg",
  "Elsewhere/pic7.svg",
  "Notes/Sub/pic8.svg",
  "X/pic8.svg",
  "Mmm/pic9.svg",
  "Bbb/pic9.svg",
  "Shots/100% done.svg",
];

const TOP =
  "Top.\n\n![[pic1.svg]]\n\n![[pic2.svg]]\n\n![[pic3.svg]]\n\n![[pic3b.svg]]\n\n" +
  "![[img/pic5.svg]]\n\n![](../img/pic6.svg)\n\n![](pic%20six.svg)\n\n![](pic7.svg)\n\n" +
  "![[100% done.svg]]\n";
const NESTED = "Nested.\n\n![[pic4.svg]]\n\n![[pic4b.svg]]\n\n![[pic8.svg]]\n\n![[pic9.svg]]\n";

function seed() {
  const files: Record<string, string> = {
    "Notes/Top.md": TOP,
    "Notes/Sub/Nested.md": NESTED,
  };
  for (const rel of FILES) files[rel] = svg(rel);
  return files;
}

/** The vault path each picture on screen was loaded from, in order. */
const drawnFrom = (h: AppHandle) =>
  h.page
    .locator("[data-editor] img")
    .evaluateAll((imgs) =>
      imgs.map((img) =>
        decodeURIComponent(new URL((img as HTMLImageElement).src).pathname.slice(1)),
      ),
    );

test("each embed draws the copy Obsidian draws, and the notes are untouched", async () => {
  const h = await launchApp(seed());
  try {
    await expandAllFolders(h.page);
    await h.openNote("Top");
    await expect
      .poll(() => drawnFrom(h))
      .toEqual([
        "pic1.svg", // 1: the path from the vault's top, over a copy beside the note
        "pic2.svg", // 2: attachments/ has no place of its own
        "Zeta/pic3.svg", // 3: the shorter path
        "Zulu/pic3b.svg", // 3b: the shorter path, not A–Z
        "Other/img/pic5.svg", // 5: only a path ending in img/pic5.svg
        "img/pic6.svg", // 6: ../ from the note's folder
        "Notes/pic six.svg", // 6b: %20 decoded, beside the note
        "Elsewhere/pic7.svg", // 7: a Markdown link found by name
        "Shots/100% done.svg", // a wikilink's % is part of the name
      ]);
    await expect(h.page.getByTestId("missing-attachment")).toHaveCount(0);

    await h.openNote("Nested");
    await expect
      .poll(() => drawnFrom(h))
      .toEqual([
        "Notes/pic4.svg", // 4: a tie in length goes A–Z
        "Aaa/pic4b.svg", // 4b: a sibling folder is not nearer
        "Notes/Sub/pic8.svg", // 8: the note's own folder beats a shorter path
        "Bbb/pic9.svg", // 9: a tie in length goes A–Z
      ]);

    await sleep(SETTLE_MS);
    expect(h.vault.read("Notes/Top.md")).toBe(TOP);
    expect(h.vault.read("Notes/Sub/Nested.md")).toBe(NESTED);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a picture that arrives after Not found shows without reopening the note", async () => {
  const note = "Waiting.\n\n![[late.svg]]\n\n![[stored.svg]]\n";
  const h = await launchApp({ "Waiting.md": note });
  try {
    await h.openNote("Waiting");
    const cards = h.page.getByTestId("missing-attachment");
    await expect(cards).toHaveCount(2);

    // A sync client drops one into a folder, and one into the attachment store.
    h.vault.write("Inbox/late.svg", svg("late"));
    h.vault.write("attachments/stored.svg", svg("stored"));

    await expect(cards).toHaveCount(0);
    await expect.poll(() => drawnFrom(h)).toEqual(["Inbox/late.svg", "attachments/stored.svg"]);
    expect(h.vault.read("Waiting.md")).toBe(note);
  } finally {
    await h.close();
  }
});

test("a note moved to another folder reads its pictures from there", async () => {
  const h = await launchApp({
    "A/Trip.md": "Trip.\n\n![[map.svg]]\n",
    "A/map.svg": svg("A"),
    "B/map.svg": svg("B"),
  });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Trip");
    await expect.poll(() => drawnFrom(h)).toEqual(["A/map.svg"]);

    await moveNoteToFolder(h.page, "Trip", "B");

    await expect.poll(() => drawnFrom(h)).toEqual(["B/map.svg"]);
  } finally {
    await h.close();
  }
});

test("Show in Finder and Copy image reach the file drawn, found by name", async () => {
  const h = await launchApp({
    "Notes/Plan.md": "Plan.\n\n![[chart.svg]]\n",
    "Notes/Figures/chart.svg": svg("chart"),
  });
  try {
    // Record what the main process is asked to reveal and copy.
    await h.app.evaluate(({ shell, nativeImage }) => {
      const g = globalThis as unknown as { reached: string[] };
      g.reached = [];
      shell.showItemInFolder = (p: string) => void g.reached.push(p);
      const create = nativeImage.createFromPath;
      nativeImage.createFromPath = (p: string) => {
        g.reached.push(p);
        return create(p);
      };
    });
    await expandAllFolders(h.page);
    await h.openNote("Plan");
    const picture = h.page.locator("[data-editor] img");
    await expect(picture).toBeVisible();

    for (const item of [
      process.platform === "darwin" ? "Show in Finder" : "Show in folder",
      "Copy image",
    ]) {
      await picture.click({ button: "right" });
      await h.page.getByRole("menuitem", { name: item }).click();
    }

    const file = h.vault.file("Notes/Figures/chart.svg");
    await expect
      .poll(() => h.app.evaluate(() => (globalThis as unknown as { reached: string[] }).reached))
      .toEqual([file, file]);
  } finally {
    await h.close();
  }
});

test("a dropped picture never takes a name an older file elsewhere has", async () => {
  const h = await launchApp({
    "Notes/Album.md": "Album.\n",
    "Old/photo.png": "old",
  });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Album");
    const box = await h.page.locator("[data-editor]").boundingBox();
    if (!box) throw new Error("no editor");
    // A 1×1 PNG.
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    await dropFiles(h.page, [{ name: "photo.png", bytes }], box.x + 40, box.y + box.height - 10);

    await expect.poll(() => drawnFrom(h)).toEqual(["attachments/photo-2.png"]);
    await expect
      .poll(() => h.vault.read("Notes/Album.md"), { timeout: 5_000 })
      .toContain("![[photo-2.png]]");
    expect(h.vault.read("Old/photo.png")).toBe("old");
  } finally {
    await h.close();
  }
});

test("a file card found in another folder opens at the page its embed names", async () => {
  const h = await launchApp(
    { "Notes/Revision.md": "Revision.\n\n![[Slides.pdf#page=2]]\n" },
    {
      prepare: (vault) => {
        fs.mkdirSync(vault.file("Lectures"), { recursive: true });
        fs.writeFileSync(vault.file("Lectures/Slides.pdf"), makePdf([["One"], ["Two"], ["Three"]]));
      },
    },
  );
  try {
    await expandAllFolders(h.page);
    await h.openNote("Revision");
    const card = h.page.locator("[data-block-type='file']");
    await expect(h.page.getByTestId("missing-attachment")).toHaveCount(0);
    await card.getByText("Slides", { exact: true }).click();
    await expect(h.page.getByTestId("pdf-pages")).toBeVisible();
    await expect(h.page.getByTestId("page-field")).toHaveValue("2");
    expect(h.vault.read("Notes/Revision.md")).toBe("Revision.\n\n![[Slides.pdf#page=2]]\n");
  } finally {
    await h.close();
  }
});

test("after a switch of storage location, a picture is found in the new one", async () => {
  const h = await launchApp({ "Trip.md": "Trip.\n\n![[map.svg]]\n", "Home/map.svg": svg("home") });
  try {
    const other = path.join(path.dirname(h.vault.dir), "Away");
    fs.mkdirSync(path.join(other, "Abroad"), { recursive: true });
    fs.writeFileSync(path.join(other, "Trip.md"), "Trip.\n\n![[map.svg]]\n");
    fs.writeFileSync(path.join(other, "Abroad", "map.svg"), svg("away"));
    await h.openNote("Trip");
    await expect.poll(() => drawnFrom(h)).toEqual(["Home/map.svg"]);

    // Settings → Add folder…, then the row's Switch to.
    await h.page.getByTestId("wordmark-settings-button").click();
    await h.app.evaluate(({ dialog }, d) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] });
    }, other);
    await h.page.getByRole("button", { name: "Add folder…" }).click();
    const row = h.page.getByRole("listitem", { name: /^Away,/ });
    await row.hover();
    await h.page.getByRole("button", { name: "Away options" }).click();
    await h.page.getByTestId("location-switch").click();
    await expect(h.page.getByTestId("vault-label")).toHaveText("Away");
    await h.page.keyboard.press("Escape");

    await h.openNote("Trip");
    await expect.poll(() => drawnFrom(h)).toEqual(["Abroad/map.svg"]);
    await expect(h.page.getByTestId("missing-attachment")).toHaveCount(0);
  } finally {
    await h.close();
  }
});
