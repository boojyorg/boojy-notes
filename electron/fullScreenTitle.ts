import type { BrowserWindow } from "electron";
import koffi from "koffi";

/**
 * EXPERIMENT. macOS full screen slides a strip down from the top edge with
 * the window's title beside the traffic lights; Electron cannot centre it. So
 * the window keeps no title there (main.js) and this lays a label of its own,
 * centred, into the same strip: the close button's superview, AppKit's title
 * bar view. That view is undocumented: if a macOS update moves the button,
 * the label is not placed and the strip simply shows no title.
 */

type Ptr = unknown;

const objc = koffi.load("/usr/lib/libobjc.A.dylib");
koffi.load("/System/Library/Frameworks/AppKit.framework/AppKit");
const getClass = objc.func("void *objc_getClass(const char *)");
const sel = objc.func("void *sel_registerName(const char *)");
const msg = (result: string, args: string[]) =>
  objc.func("objc_msgSend", result, ["void *", "void *", ...args]);
const sendP = msg("void *", []);
const sendPP = msg("void *", ["void *"]);
const sendPL = msg("void *", ["long"]);
const sendPD = msg("void *", ["double"]);
const sendPStr = msg("void *", ["const char *"]);
const sendVP = msg("void", ["void *"]);
const sendV = msg("void", []);
const sendVB = msg("void", ["bool"]);
const sendVL = msg("void", ["long"]);
const sendVFL = msg("void", ["float", "long"]);
const sendPPDD = msg("void *", ["void *", "double", "double"]);

const NS_WINDOW_CLOSE_BUTTON = 0;
const NS_TEXT_ALIGNMENT_CENTER = 2;
const NS_LINE_BREAK_BY_TRUNCATING_TAIL = 4;
const NS_HORIZONTAL = 0;
/** Room kept clear each side for the lights. */
const SIDE_ROOM = 160;

const nsString = (text: string) =>
  sendPStr(getClass("NSString"), sel("stringWithUTF8String:"), text);

let label: Ptr = null;

/** Puts the centred label into the strip (once per entry into full screen). */
export function showFullScreenTitle(win: BrowserWindow, text: string): void {
  hideFullScreenTitle();
  const view = koffi.decode(win.getNativeWindowHandle(), "void *");
  const window = sendP(view, sel("window"));
  const close = sendPL(window, sel("standardWindowButton:"), NS_WINDOW_CLOSE_BUTTON);
  const bar = close && sendP(close, sel("superview"));
  if (!bar) return;

  label = sendPP(getClass("NSTextField"), sel("labelWithString:"), nsString(text));
  sendVP(label, sel("setFont:"), sendPD(getClass("NSFont"), sel("titleBarFontOfSize:"), 0));
  sendVP(label, sel("setTextColor:"), sendP(getClass("NSColor"), sel("labelColor")));
  sendVL(label, sel("setAlignment:"), NS_TEXT_ALIGNMENT_CENTER);
  sendVL(label, sel("setLineBreakMode:"), NS_LINE_BREAK_BY_TRUNCATING_TAIL);
  sendVFL(label, sel("setContentCompressionResistancePriority:forOrientation:"), 1, NS_HORIZONTAL);
  sendVB(label, sel("setTranslatesAutoresizingMaskIntoConstraints:"), false);
  sendVP(bar, sel("addSubview:"), label);

  const pin = (constraint: Ptr) => sendVB(constraint, sel("setActive:"), true);
  const anchor = (v: Ptr, name: string) => sendP(v, sel(name));
  pin(
    sendPP(
      anchor(label, "centerXAnchor"),
      sel("constraintEqualToAnchor:"),
      anchor(bar, "centerXAnchor"),
    ),
  );
  pin(
    sendPP(
      anchor(label, "centerYAnchor"),
      sel("constraintEqualToAnchor:"),
      anchor(close, "centerYAnchor"),
    ),
  );
  pin(
    sendPPDD(
      anchor(label, "widthAnchor"),
      sel("constraintLessThanOrEqualToAnchor:multiplier:constant:"),
      anchor(bar, "widthAnchor"),
      1,
      -2 * SIDE_ROOM,
    ),
  );
}

export function setFullScreenTitle(text: string): void {
  if (label) sendVP(label, sel("setStringValue:"), nsString(text));
}

export function hideFullScreenTitle(): void {
  if (label) sendV(label, sel("removeFromSuperview"));
  label = null;
}
