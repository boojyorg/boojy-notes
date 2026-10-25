import { createRequire } from "node:module";
import type { BrowserWindow } from "electron";

/**
 * macOS full screen slides a strip down from the top edge with the window's
 * title beside the traffic lights; Electron cannot centre it. So there the
 * window has no title (main.js) and this lays a centred label of its own into
 * the same strip, through AppKit (koffi: no native build). The strip's view is
 * the close button's superview, which Apple doesn't document: if an update
 * moves it, or anything here throws, no label is placed and the strip shows
 * no title. Check it after each major macOS update.
 */

type Ptr = unknown;
type AppKit = ReturnType<typeof loadAppKit>;

const NS_WINDOW_CLOSE_BUTTON = 0;
const NS_TEXT_ALIGNMENT_CENTER = 2;
const NS_LINE_BREAK_BY_TRUNCATING_TAIL = 4;
const NS_HORIZONTAL = 0;
/** Room kept clear each side for the lights. */
const SIDE_ROOM = 160;

/** Loaded on first use, on a Mac only: the libraries exist nowhere else. */
function loadAppKit() {
  const koffi = createRequire(import.meta.url)("koffi");
  const objc = koffi.load("/usr/lib/libobjc.A.dylib");
  koffi.load("/System/Library/Frameworks/AppKit.framework/AppKit");
  const msg = (result: string, args: string[]) =>
    objc.func("objc_msgSend", result, ["void *", "void *", ...args]);
  const getClass = objc.func("void *objc_getClass(const char *)");
  const sel = objc.func("void *sel_registerName(const char *)");
  const sendPStr = msg("void *", ["const char *"]);
  return {
    koffi,
    getClass,
    sel,
    sendP: msg("void *", []),
    sendPP: msg("void *", ["void *"]),
    sendPL: msg("void *", ["long"]),
    sendPD: msg("void *", ["double"]),
    sendPPDD: msg("void *", ["void *", "double", "double"]),
    sendV: msg("void", []),
    sendVP: msg("void", ["void *"]),
    sendVB: msg("void", ["bool"]),
    sendVL: msg("void", ["long"]),
    sendVFL: msg("void", ["float", "long"]),
    nsString: (text: string) => sendPStr(getClass("NSString"), sel("stringWithUTF8String:"), text),
  };
}

let appKit: AppKit | null = null;
/** Retained by us, so it outlives its window; released by `hideFullScreenTitle`. */
let label: Ptr = null;
let owner: BrowserWindow | null = null;

/** Runs `fn` with AppKit, or not at all: a failure only costs the label. */
function withAppKit(fn: (k: AppKit) => void): void {
  if (process.platform !== "darwin") return;
  try {
    appKit ??= loadAppKit();
    fn(appKit);
  } catch (err) {
    console.warn("fullScreenTitle:", err);
    label = null;
  }
}

/** Puts the centred label into the strip, on each entry into full screen. */
export function showFullScreenTitle(win: BrowserWindow, text: string): void {
  hideFullScreenTitle();
  withAppKit(({ koffi, getClass, sel, nsString, ...k }) => {
    const view = koffi.decode(win.getNativeWindowHandle(), "void *");
    const window = k.sendP(view, sel("window"));
    const close = k.sendPL(window, sel("standardWindowButton:"), NS_WINDOW_CLOSE_BUTTON);
    const bar = close && k.sendP(close, sel("superview"));
    if (!bar) return;

    const field = k.sendPP(getClass("NSTextField"), sel("labelWithString:"), nsString(text));
    const font = k.sendPD(getClass("NSFont"), sel("titleBarFontOfSize:"), 0);
    k.sendVP(field, sel("setFont:"), font);
    k.sendVP(field, sel("setTextColor:"), k.sendP(getClass("NSColor"), sel("labelColor")));
    k.sendVL(field, sel("setAlignment:"), NS_TEXT_ALIGNMENT_CENTER);
    k.sendVL(field, sel("setLineBreakMode:"), NS_LINE_BREAK_BY_TRUNCATING_TAIL);
    const lowResistance = sel("setContentCompressionResistancePriority:forOrientation:");
    k.sendVFL(field, lowResistance, 1, NS_HORIZONTAL);
    k.sendVB(field, sel("setTranslatesAutoresizingMaskIntoConstraints:"), false);
    k.sendVP(bar, sel("addSubview:"), field);
    // A closed window frees its views without leaving full screen first: a
    // pointer we didn't own would dangle and crash the next call.
    label = k.sendP(field, sel("retain"));
    owner = win;
    win.once("closed", hideFullScreenTitle);

    const anchor = (v: Ptr, name: string) => k.sendP(v, sel(name));
    const equal = (a: Ptr, b: Ptr) => k.sendPP(a, sel("constraintEqualToAnchor:"), b);
    const atMost = sel("constraintLessThanOrEqualToAnchor:multiplier:constant:");
    for (const constraint of [
      equal(anchor(field, "centerXAnchor"), anchor(bar, "centerXAnchor")),
      equal(anchor(field, "centerYAnchor"), anchor(close, "centerYAnchor")),
      k.sendPPDD(
        anchor(field, "widthAnchor"),
        atMost,
        anchor(bar, "widthAnchor"),
        1,
        -2 * SIDE_ROOM,
      ),
    ]) {
      k.sendVB(constraint, sel("setActive:"), true);
    }
  });
}

export function setFullScreenTitle(text: string): void {
  if (!label) return;
  withAppKit(({ sel, nsString, sendVP }) => sendVP(label, sel("setStringValue:"), nsString(text)));
}

export function hideFullScreenTitle(): void {
  if (owner && !owner.isDestroyed()) owner.removeListener("closed", hideFullScreenTitle);
  owner = null;
  if (!label) return;
  withAppKit(({ sel, sendV }) => {
    sendV(label, sel("removeFromSuperview"));
    sendV(label, sel("release"));
  });
  label = null;
}
