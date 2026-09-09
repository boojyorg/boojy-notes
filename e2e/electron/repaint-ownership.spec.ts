/**
 * Ownership between note state and the live editable DOM when a text block is
 * repainted programmatically. The browser owns the DOM while the user types and
 * the keystroke ref runs ahead of React state; a repaint from state must never
 * paint that lag over the DOM, and a programmatic change must become visible
 * without the stale DOM being read back over it.
 *
 * Reproduces two 2026-09-07 review findings in the real app. Find → Replace
 * changed the file but not the paragraph, and the next keystroke in that block
 * wrote the old text back (§3.3). Typing ` after` past a freshly typed
 * `[x](https://a.b)` lost a character: the link's styling pass repainted the
 * block from a render that was one keystroke behind the DOM (§1.1).
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, SETTLE_MS, launchApp, noteText, sleep, waitForFile } from "./harness";

const NOTE = "Note.md";

test("Find → Replace changes the paragraph on screen, and typing after it keeps the replacement", async () => {
  const h = await launchApp({ [NOTE]: "Tea leaves for two.\n\nMore leaves here.\n" });
  try {
    await h.openNote("Note");
    const first = h.page.locator("[data-block-id]").first();
    await first.click();
    await h.page.keyboard.press(`${MOD}+h`);
    await h.page.getByPlaceholder("Find in note...").fill("leaves");
    await expect(h.page.getByText("1 of 2")).toBeVisible();
    await h.page.getByPlaceholder("Replace with...").fill("leafs");
    await h.page.getByRole("button", { name: "Replace", exact: true }).click();

    // The screen shows the replacement at once, and the counter moves on to
    // the one match left.
    await expect(first).toHaveText("Tea leafs for two.");
    await expect(h.page.getByText("1 of 1")).toBeVisible();

    // Typing in the replaced block keeps the replacement: the block is read
    // back from what is on screen, which is the replaced text.
    await h.page.keyboard.press("Escape");
    await first.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Yes.");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("Yes."));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe("Tea leafs for two. Yes.\n\nMore leaves here.\n");
    expect(await noteText(h.page)).toBe("Tea leafs for two. Yes.\nMore leaves here.");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Replace All edits the visible text of every text block and leaves a URL's inside alone", async () => {
  const md = "See [docs](https://docs.example.com) for docs.\n\n- docs again\n";
  const h = await launchApp({ [NOTE]: md });
  try {
    await h.openNote("Note");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(`${MOD}+h`);
    await h.page.getByPlaceholder("Find in note...").fill("docs");
    await expect(h.page.getByText("1 of 3")).toBeVisible();
    // `$&` is text, not a regex back-reference.
    await h.page.getByPlaceholder("Replace with...").fill("$& notes");
    await h.page.getByRole("button", { name: "All" }).click();

    await expect(h.page.getByText("0 of 0")).toBeVisible();
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("notes"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe(
      "See [$& notes](https://docs.example.com) for $& notes.\n\n- $& notes again\n",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("typing straight after a Markdown link keeps every character", async () => {
  const h = await launchApp({ [NOTE]: "Intro.\n" });
  try {
    await h.openNote("Note");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Link test [x](https://a.b)");
    // Let the link's text reach state, so the next burst is the one under test:
    // the space styles the link and the `a` lands inside the commit window.
    await sleep(400);
    await h.page.keyboard.type(" after");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("after"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe("Intro. Link test [x](https://a.b) after\n");
    expect(
      await h.page
        .locator("[data-block-id] a.external-link")
        .evaluateAll((els) =>
          els.map((e) => [e.getAttribute("data-url"), e.firstChild?.textContent]),
        ),
    ).toEqual([["https://a.b", "x"]]);
    expect((await noteText(h.page)).replace("↗", "")).toBe("Intro. Link test x after");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
