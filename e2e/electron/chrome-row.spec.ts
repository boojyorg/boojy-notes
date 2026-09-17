/**
 * The chrome row's controls and the note's name share one line, and the name
 * stays clear of all of them — whatever the window width, and in either
 * sidebar state. Review H12 found the reserve measured from the web inset, so
 * on macOS the toggle was drawn over the first letters at 1,200px and at 700px
 * alike; since 2026-09-12 there are up to five controls in front of the name
 * rather than one, and since 2026-09-15 the name sits centred in a band that
 * must clear all of them by `PATH_AIR`. This spec is a real guard on macOS and
 * a plain layout check elsewhere; `note-path.spec.ts` covers the path itself.
 */
import { expect, type Page, test } from "@playwright/test";
import { PATH_AIR } from "../../src/components/EditorChrome";
import { type AppHandle, launchApp } from "./harness";
import {
  EDITOR_FLOOR_W,
  HEADER_AIR,
  HEADER_RIGHT_INSET,
  MAC_TRAFFIC_INSET,
  SIDEBAR_HANDLE_W,
  SIDEBAR_MIN_W,
  WINDOW_MIN_W,
} from "../../src/constants/layout";

/** A transitioned margin can settle a hundredth of a pixel short of its target. */
const SUBPIXEL = 0.5;

/** The chrome buttons that sit left of the note's name, in DOM order. */
const LEFT_CONTROLS = ["Toggle sidebar", "Search notes", "New note", "Undo", "Redo"];

/**
 * Wait for every running CSS transition and animation to finish. The chrome
 * row moves on the panel's clock since 2026-09-14 (the history pair slides,
 * the trio fades in), so a position read straight after a toggle or a resize
 * is a position in flight.
 */
async function settled(page: Page) {
  await page.evaluate(async () => {
    // A transition a resize interrupts rejects its `finished` with AbortError
    // and a fresh one takes its place, so wait in rounds until none is left.
    for (let round = 0; round < 10; round++) {
      const running = document.getAnimations();
      if (running.length === 0) return;
      await Promise.allSettled(running.map((a) => a.finished));
    }
  });
}

async function setWidth(h: AppHandle, width: number) {
  await h.app.evaluate(({ BrowserWindow }, w) => {
    BrowserWindow.getAllWindows()[0].setSize(w, 800);
  }, width);
  await expect
    .poll(async () => await h.page.evaluate(() => window.innerWidth), { timeout: 5000 })
    .toBe(width);
  await settled(h.page);
}

/**
 * The name's box once the layout has settled: the path's, whose edges are the
 * text's (the name's own box reaches 5px further each side for its hover pill,
 * which is not ink). The sidebar collapses and the row's inset eases on the
 * panel's clock, and a window resize inside that window measures a row in
 * flux. Assertions on the name therefore poll.
 */
async function titleBox(page: Page) {
  const b = await page.getByTestId("note-path").boundingBox();
  expect(b, "path box").not.toBeNull();
  return { x: b!.x, right: b!.x + b!.width, y: b!.y, height: b!.height };
}

/** The right edge of the rightmost chrome control on the title's row. */
async function controlsRight(page: Page, titles: string[]) {
  let right = 0;
  let mid = 0;
  for (const title of titles) {
    const box = await page.locator(`[aria-label='${title}']:not([inert] *)`).boundingBox();
    expect(box, `${title} box`).not.toBeNull();
    if (box!.x + box!.width > right) {
      right = box!.x + box!.width;
      mid = box!.y + box!.height / 2;
    }
  }
  return { right, mid };
}

test("the chrome row's controls never overlap the note's name, wide or narrow", async () => {
  // WINDOW_MIN_W is the window's minimum (electron/main.js).
  const h = await launchApp({ "Link end.md": "Alpha.\n" });
  try {
    await h.openNote("Link end");

    // Expanded: the history pair is the only thing in front of the name, at
    // every width, since the sidebar stays in the layout at the minimum too.
    for (const width of [1200, WINDOW_MIN_W]) {
      await setWidth(h, width);
      const { right, mid } = await controlsRight(h.page, ["Undo", "Redo"]);
      const more = await h.page.locator("button[aria-label='Note actions']").boundingBox();
      await expect
        .poll(async () => (await titleBox(h.page)).x, {
          message: `title left, expanded at ${width}`,
        })
        .toBeGreaterThanOrEqual(right + PATH_AIR - SUBPIXEL);
      // The name still has room to read in, and stays clear of the ··· .
      await expect
        .poll(async () => (await titleBox(h.page)).right, {
          message: `title right, expanded at ${width}`,
        })
        .toBeLessThanOrEqual(more!.x - PATH_AIR + SUBPIXEL);
      const n = await titleBox(h.page);
      expect(mid).toBeGreaterThan(n.y);
      expect(mid).toBeLessThan(n.y + n.height);
    }
    await setWidth(h, 1200);

    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await settled(h.page);
    await expect(h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)")).toBeVisible();

    // Collapsed: five controls, and the name still starts past the last.
    for (const width of [1200, 700, WINDOW_MIN_W]) {
      await setWidth(h, width);
      const { right, mid } = await controlsRight(h.page, LEFT_CONTROLS);
      const more = await h.page.locator("button[aria-label='Note actions']").boundingBox();
      await expect
        .poll(async () => (await titleBox(h.page)).x, {
          message: `title left at ${width}, collapsed`,
        })
        .toBeGreaterThanOrEqual(right + PATH_AIR - SUBPIXEL);
      // The name still has room to read in, and stays clear of the ··· .
      await expect
        .poll(async () => (await titleBox(h.page)).right, { message: `title right at ${width}` })
        .toBeLessThanOrEqual(more!.x - PATH_AIR + SUBPIXEL);
      // Same row: the controls' centre falls within the label's line box, and
      // nothing has wrapped to a second line.
      const n = await titleBox(h.page);
      expect(mid).toBeGreaterThan(n.y);
      expect(mid).toBeLessThan(n.y + n.height);
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a very long name yields to the controls rather than covering them", async () => {
  const long = "A note with a deliberately and extravagantly long file name for this test";
  const h = await launchApp({ [`${long}.md`]: "Alpha.\n" });
  try {
    await h.openNote(long);
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await settled(h.page);
    await setWidth(h, WINDOW_MIN_W);
    const { right } = await controlsRight(h.page, LEFT_CONTROLS);
    const more = await h.page.locator("button[aria-label='Note actions']").boundingBox();
    await expect
      .poll(async () => (await titleBox(h.page)).x)
      .toBeGreaterThanOrEqual(right + PATH_AIR - SUBPIXEL);
    await expect
      .poll(async () => (await titleBox(h.page)).right)
      .toBeLessThanOrEqual(more!.x - PATH_AIR + SUBPIXEL);
    // Truncated, not wrapped: the name's own box is one line (the path's box
    // is the chrome button's 32px for a root note, since 2026-09-16).
    const name = await h.page.getByRole("textbox", { name: "Note title" }).boundingBox();
    expect(name!.height).toBeLessThan(30);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

/**
 * macOS full screen hides the traffic lights, so the inset that clears them
 * (86px in front of the wordmark expanded, and of the whole left group
 * collapsed) was dead space there, and the note's name sat a long way right
 * for nothing (2026-09-14). Both fall back to the ordinary inset while full
 * screen is on and return when it ends. Only macOS has the lights, so this is
 * a macOS-only guard; elsewhere the inset never applies.
 */
test("full screen drops the traffic-light inset and leaving it brings it back", async () => {
  test.skip(process.platform !== "darwin", "the traffic lights are macOS's");
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  const setFullScreen = (on: boolean) =>
    h.app.evaluate(({ BrowserWindow }, v) => {
      BrowserWindow.getAllWindows()[0].setFullScreen(v);
    }, on);
  const leftOf = async (name: string) =>
    (await h.page.locator(`[aria-label='${name}']:not([inert] *)`).boundingBox())!.x;
  const wordmarkLeft = async () =>
    (await h.page.getByTestId("wordmark-settings-button").boundingBox())!.x;
  try {
    await h.openNote("Alpha");
    await setWidth(h, 1200);
    const wordmark = h.page.getByTestId("wordmark-settings-button");
    const atRest = (await wordmark.boundingBox())!.x;
    expect(atRest).toBe(MAC_TRAFFIC_INSET);

    // Expanded: the wordmark moves back to the header's own inset...
    await setFullScreen(true);
    await expect.poll(() => wordmarkLeft(), { timeout: 10000 }).toBeLessThan(40);
    // ...and collapsed, the group starts at the web inset with the name past it.
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await settled(h.page);
    await expect.poll(() => leftOf("Toggle sidebar")).toBe(10);
    await settled(h.page);
    const { right } = await controlsRight(h.page, LEFT_CONTROLS);
    const n = await titleBox(h.page);
    expect(n.x).toBeGreaterThanOrEqual(right + PATH_AIR - SUBPIXEL);

    // Leaving full screen restores the inset in both states.
    await setFullScreen(false);
    await expect.poll(() => leftOf("Toggle sidebar"), { timeout: 10000 }).toBe(MAC_TRAFFIC_INSET);
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await settled(h.page);
    await expect.poll(() => wordmarkLeft()).toBe(atRest);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await setFullScreen(false).catch(() => {});
    await h.close();
  }
});

// The sidebar yields before the note does (2026-09-14). A sidebar dragged
// wide keeps that width as a preference, but in a narrow window it is drawn
// no wider than leaves the editor its floor, down to the sidebar's own
// minimum at the window's; widening the window gives the dragged width back.
test("a wide sidebar yields to the editor in a narrow window, and comes back", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    await setWidth(h, 1200);
    const row = h.page.locator("[data-note-id]").first();
    const sidebarWidth = async () => {
      // The wrapper the width is set on is the row's nearest ancestor with an
      // explicit pixel width; read it off the drag handle's left edge instead,
      // which sits exactly at the sidebar's right edge.
      const handle = await h.page.locator("[style*='col-resize']").boundingBox();
      expect(handle, "drag handle").not.toBeNull();
      return Math.round(handle!.x);
    };
    // Drag the divider out to 380px.
    const start = await sidebarWidth();
    await h.page.mouse.move(start + SIDEBAR_HANDLE_W / 2, 400);
    await h.page.mouse.down();
    await h.page.mouse.move(380, 400, { steps: 8 });
    await h.page.mouse.up();
    await expect.poll(sidebarWidth).toBe(380);

    await setWidth(h, 600);
    await expect.poll(sidebarWidth).toBe(600 - SIDEBAR_HANDLE_W - EDITOR_FLOOR_W);
    // The note has its floor beside it: the row is visible and the title
    // starts past the sidebar and its handle.
    await expect(row).toBeVisible();
    const title = await titleBox(h.page);
    expect(title.x).toBeGreaterThanOrEqual(600 - EDITOR_FLOOR_W);

    await setWidth(h, WINDOW_MIN_W);
    await expect.poll(sidebarWidth).toBe(SIDEBAR_MIN_W);
    // The header row is whole at the minimum: the toggle ends inside the panel
    // and the wordmark keeps its air before Search (2026-09-16; at a bare 200
    // the toggle lost 26px past the divider once Search joined the row).
    const toggle = (await h.page
      .locator("[aria-label='Toggle sidebar']:not([inert] *)")
      .boundingBox())!;
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(
      SIDEBAR_MIN_W - HEADER_RIGHT_INSET + SUBPIXEL,
    );
    const wordmark = (await h.page.getByTestId("wordmark-settings-button").boundingBox())!;
    const search = (await h.page
      .getByRole("button", { name: "Search notes", exact: true })
      .boundingBox())!;
    expect(search.x - (wordmark.x + wordmark.width)).toBeGreaterThanOrEqual(HEADER_AIR - SUBPIXEL);

    await setWidth(h, 1200);
    await expect.poll(sidebarWidth).toBe(380);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("no window-drag rectangle lies under a chrome button, in either sidebar state", async () => {
  test.skip(process.platform !== "darwin", "drag regions are macOS's");
  const h = await launchApp({ "University/Archive/Todd's Note.md": "Alpha.\n" });
  try {
    await h.page.locator('[role="treeitem"]').filter({ hasText: "University" }).click();
    await h.page.locator('[role="treeitem"]').filter({ hasText: "Archive" }).click();
    await h.openNote("Todd's Note");
    // Chromium applies app-region rectangles in DOM order, a later `drag`
    // unioning back over an earlier `no-drag`. A button inside or after the
    // drag element (the sidebar header's own wordmark and toggle) is
    // subtracted correctly; one that comes before it (the editor's chrome,
    // rendered ahead of the sidebar and the editor) is overridden, so no drag
    // rectangle may overlap a button that precedes it.
    const check = async (state: string) => {
      const overlaps = await h.page.evaluate(() => {
        const rect = (el: Element) => el.getBoundingClientRect();
        const drags = [...document.querySelectorAll<HTMLElement>('[style*="app-region: drag"]')];
        const buttons = [...document.querySelectorAll<HTMLElement>("button[title]")].filter(
          (b) => !b.closest("[inert]") && rect(b).width > 0,
        );
        const hits: string[] = [];
        for (const d of drags) {
          const r = rect(d);
          if (r.width === 0 || r.right < 0) continue;
          for (const b of buttons) {
            const q = rect(b);
            const precedes = d.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING;
            if (
              precedes &&
              q.left < r.right &&
              q.right > r.left &&
              q.top < r.bottom &&
              q.bottom > r.top
            )
              hits.push(`${d.dataset.testid ?? d.className} over ${b.title}`);
          }
        }
        return { drags: drags.length, hits };
      });
      expect(overlaps.drags, `${state}: drag rectangles present`).toBeGreaterThan(0);
      expect(overlaps.hits, state).toEqual([]);
    };
    await check("expanded");
    // While the path's popup is open every drag region stands down, so a
    // press on the empty top row reaches the page and closes the popup.
    const regionModes = () =>
      h.page.evaluate(() =>
        [...document.querySelectorAll("[data-drag-region]")].map((el) =>
          getComputedStyle(el).getPropertyValue("app-region"),
        ),
      );
    expect(await regionModes()).toEqual(["drag", "drag"]);
    await h.page.getByTestId("note-path-folder").filter({ hasText: "Archive" }).click();
    await h.page.getByTestId("path-tree").waitFor();
    expect(await regionModes()).toEqual(["no-drag", "no-drag"]);
    await h.page.keyboard.press("Escape");
    await expect(h.page.getByTestId("path-tree")).toHaveCount(0);
    expect(await regionModes()).toEqual(["drag", "drag"]);
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").click();
    await h.page.locator("[aria-label='Toggle sidebar']:not([inert] *)").waitFor();
    await settled(h.page);
    await check("collapsed");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
