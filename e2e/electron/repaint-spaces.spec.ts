/**
 * A repaint keeps the space just typed, and changes no other space.
 *
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
  // DIAGNOSTIC: one trace per run, named by run and pass or fail.
  const testInfo = test.info();
  const traceDir = process.env.BOOJY_TRACE_DIR;
  const trace = traceDir ? `${traceDir}/run-${testInfo.repeatEachIndex}.log` : null;
  if (trace) {
    fs.mkdirSync(traceDir!, { recursive: true });
    process.env.BOOJY_TRACE = trace;
  }
  const testLog = (line: string) =>
    trace && fs.appendFileSync(trace, `# TEST ${Date.now()} ${line}\n`);
  let ok = false;
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
        testLog(`rename ${path} -> ${next}; dir: ${fs.readdirSync(h.vault.file("")).join(" | ")}`);
        fs.renameSync(path, next);
        path = next;
      }
    }
    await sleep(SETTLE_MS * 2);
    testLog(`end; dir: ${fs.readdirSync(h.vault.file("")).join(" | ")}`);
    const expected = `Start. w00 ${words.join(" ")}`;
    expect(await noteText(h.page)).toBe(expected);
    // Shown as U+00A0 where HTML would hide it, written as the plain space it is.
    await waitForFile(path, (t) => t === expected, { label: "plain spaces on disk" });
    expect(h.pageErrors).toEqual([]);
    ok = true;
  } finally {
    await h.close();
    if (trace) fs.renameSync(trace, trace.replace(".log", `-${ok ? "pass" : "FAIL"}.log`));
    delete process.env.BOOJY_TRACE;
  }
});

// A first fix painted every space HTML would hide as U+00A0, and readers other
// than typing took the painted characters for the note's (review of #352).
test("a link's label keeps its spaces through an edit", async () => {
  const h = await launchApp({ "Spaces.md": "See [[My  Note]] here." });
  try {
    await h.openNote("Spaces");
    await typeAtEnd(h.page, "!");
    await waitForFile(h.vault.file("Spaces.md"), (t) => t === "See [[My  Note]] here.!", {
      label: "the wikilink unchanged",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a hard break keeps its two spaces when Enter moves its paragraph", async () => {
  const h = await launchApp({ "Spaces.md": "First.\n\nHard break here  \nafter the break." });
  try {
    await h.openNote("Spaces");
    // The caret at the paragraph's very start, whichever of its two lines a
    // click would land on.
    const block = h.page.locator("[data-block-id]").filter({ hasText: "after the break." });
    await block.click();
    await block.evaluate((el) => {
      const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      if (text) window.getSelection()?.collapse(text, 0);
    });
    await h.page.keyboard.press("Enter");
    await waitForFile(
      h.vault.file("Spaces.md"),
      (t) => t !== "First.\n\nHard break here  \nafter the break.",
      {
        label: "the Enter written",
      },
    );
    await sleep(SETTLE_MS);
    const saved = h.vault.read("Spaces.md");
    expect(saved).toContain("Hard break here  \nafter the break.");
    expect(saved).not.toContain("\u00a0");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
