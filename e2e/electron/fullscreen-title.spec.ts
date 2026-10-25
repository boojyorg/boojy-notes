/**
 * Full screen's strip carries the app's own centred title (fullScreenTitle.ts),
 * a native label. A window closed in full screen never reports leaving it, and
 * frees its views: the label must not be left dangling, or the next full
 * screen in a reopened window crashes the app (SIGSEGV, past any try/catch).
 */
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

test.skip(process.platform !== "darwin", "the strip is macOS's");

test("closing a full-screen window and reopening one does not crash", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    const enterFullScreen = () =>
      h.app.evaluate(({ BrowserWindow }) => {
        const [win] = BrowserWindow.getAllWindows();
        win.emit("enter-full-screen");
        win.emit("page-title-updated", { preventDefault() {} }, "Alpha - Boojy Notes");
      });
    await enterFullScreen();
    const reopened = h.app.waitForEvent("window");
    await h.app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].destroy();
      app.emit("activate");
    });
    await reopened;
    await enterFullScreen();
    await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].emit("leave-full-screen"),
    );
    expect(await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
      1,
    );
  } finally {
    await h.close();
  }
});
