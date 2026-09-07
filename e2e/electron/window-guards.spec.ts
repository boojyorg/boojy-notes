/**
 * The window is the only window, and it never navigates. A `window.open` of
 * an http(s) URL goes to the system browser (stubbed here so the test opens
 * nothing); anything else is dropped; a navigation away from the page is
 * refused. Before the guards Electron opened a second BrowserWindow, preload
 * attached, for the footer's boojy.org link.
 *
 * Closing the window on macOS keeps the app alive with no window; the watcher
 * and the updater must then skip their sends rather than throw on a destroyed
 * window, and the Dock's `activate` must bring a working window back.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { launchApp, sidebarNoteTitles, sleep } from "./harness";

test("window.open and navigation are refused; http links go to the system browser", async () => {
  const h = await launchApp({ "Welcome.md": "Hello.\n" });
  try {
    const opened: string[] = [];
    // Stub the browser hand-off in the main process and record what it got.
    await h.app.evaluate(({ shell }) => {
      const calls: string[] = [];
      (globalThis as unknown as { __opened: string[] }).__opened = calls;
      shell.openExternal = async (url: string) => {
        calls.push(url);
      };
    });
    const pageUrl = h.page.url();

    await h.page.evaluate(() => {
      window.open("https://boojy.org/");
      window.open("file:///etc/hosts");
    });
    await sleep(500);
    opened.push(
      ...(await h.app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)),
    );
    expect(opened).toEqual(["https://boojy.org/"]);
    expect(h.app.windows()).toHaveLength(1);

    await h.page.evaluate(() => {
      window.location.href = "https://boojy.org/";
    });
    await sleep(500);
    expect(h.page.url()).toBe(pageUrl);
    expect(await sidebarNoteTitles(h.page)).toEqual(["Welcome"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("closing the window keeps the app running; the watcher stays quiet and activate brings it back", async () => {
  test.skip(process.platform !== "darwin", "only macOS keeps the app alive with no window");
  const h = await launchApp({ "Welcome.md": "Hello.\n" });
  try {
    // An exception thrown inside a main-process event handler (the watcher's,
    // the updater's) is uncaught there; record it instead of letting Electron
    // show its error dialog.
    await h.app.evaluate(() => {
      const g = globalThis as unknown as { __uncaught: string[] };
      g.__uncaught = [];
      process.on("uncaughtException", (err) => g.__uncaught.push(String(err)));
    });

    // Cmd+W: the close is held until the renderer's flush handshake answers.
    await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect.poll(() => h.app.windows().length, { timeout: 5_000 }).toBe(0);

    // A note lands from outside while no window exists: the watcher must not
    // send to a destroyed window.
    fs.writeFileSync(h.vault.file("While closed.md"), "Arrived.\n");
    await sleep(1500);

    const reopened = h.app.waitForEvent("window");
    await h.app.evaluate(({ app }) => app.emit("activate"));
    const page = await reopened;
    await page.getByRole("button", { name: "New note" }).waitFor();
    await expect.poll(() => sidebarNoteTitles(page)).toEqual(["While closed", "Welcome"]);

    expect(
      await h.app.evaluate(() => (globalThis as unknown as { __uncaught: string[] }).__uncaught),
    ).toEqual([]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
