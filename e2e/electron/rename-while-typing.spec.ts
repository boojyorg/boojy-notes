/**
 * A note renamed outside the app while its text is being typed keeps every
 * keystroke, spaces included.
 *
 * Found by the Android proof of concept (2026-10-16): the sync engine renamed
 * the open note to its conflicted copy while words were being typed, and one
 * space went missing ("r035r036"). Every word arrived, in order; only the
 * space typed around the rename was lost.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { launchApp, noteText, sleep, SETTLE_MS, typeAtEnd, waitForFile } from "./harness";

test("typing through an outside rename loses no space", async () => {
  const h = await launchApp({ "Alpha.md": "Start." });
  try {
    await h.openNote("Alpha");
    await typeAtEnd(h.page, " w00");
    await sleep(SETTLE_MS);

    const words = Array.from({ length: 40 }, (_, i) => `w${String(i + 1).padStart(2, "0")}`);
    let path = h.vault.file("Alpha.md");
    for (const [i, word] of words.entries()) {
      await h.page.keyboard.type(` ${word}`, { delay: 15 });
      // Renamed outside every eight words, mid-burst, as a sync client would.
      if (i % 8 === 4) {
        const next = h.vault.file(`Alpha ${i}.md`);
        fs.renameSync(path, next);
        path = next;
      }
    }
    await sleep(SETTLE_MS * 2);
    const expected = `Start. w00 ${words.join(" ")}`;
    expect(await noteText(h.page)).toBe(expected);
    // Shown as U+00A0 where HTML would hide it, written as the plain space it is.
    await waitForFile(path, (t) => t === expected, { label: "plain spaces on disk" });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
