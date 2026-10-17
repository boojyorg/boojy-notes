import { describe, expect, it } from "vitest";
import { backAction, escapeTarget, RESUME_WINDOW_MS, resumesOnNote } from "../../src/phone/screens";

describe("Back is Escape first", () => {
  it("goes to a focused field outside the note, which owns its Escape", () => {
    const input = document.createElement("input");
    document.body.append(input);
    expect(escapeTarget(input)).toBe(input);
    input.remove();
  });

  it("goes to the page when the note's text has the focus, never the text", () => {
    // In the text, Escape selects the block: Back must not do that.
    const text = document.createElement("div");
    text.contentEditable = "true";
    document.body.append(text);
    // jsdom has no isContentEditable; the browser sets it from the attribute.
    Object.defineProperty(text, "isContentEditable", { value: true });
    expect(escapeTarget(text)).toBe(document.body);
    text.remove();
  });

  it("goes to the page when nothing has the focus", () => {
    expect(escapeTarget(null)).toBe(document.body);
    expect(escapeTarget(document.body)).toBe(document.body);
  });
});

describe("Back moves only when nothing took the Escape", () => {
  it("goes from the note to Home, and from Home out of the app", () => {
    expect(backAction(true)).toBe("home");
    expect(backAction(false)).toBe("leave");
  });
});

describe("a launch reopens the note only after Android closed the app in use", () => {
  const now = 1_000_000_000;

  it("reopens the note that was on screen a moment ago", () => {
    expect(resumesOnNote({ screen: "note", at: now - 60_000 }, now)).toBe(true);
  });

  it("opens Home when Home was showing, or the app was left long ago, or never", () => {
    expect(resumesOnNote({ screen: "home", at: now - 60_000 }, now)).toBe(false);
    expect(resumesOnNote({ screen: "note", at: now - RESUME_WINDOW_MS }, now)).toBe(false);
    expect(resumesOnNote(null, now)).toBe(false);
  });
});
