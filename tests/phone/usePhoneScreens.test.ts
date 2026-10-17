/** @vitest-environment jsdom */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The phone, and Android's Back as the App plugin delivers it.
vi.mock("../../src/utils/platform", () => ({ isPhone: true }));
const back = vi.hoisted(() => ({ press: null as null | (() => void), minimize: vi.fn() }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (_event: string, listener: () => void) => {
      back.press = listener;
      return Promise.resolve({ remove: () => {} });
    },
    minimizeApp: back.minimize,
  },
}));

const { usePhoneScreens } = await import("../../src/phone/usePhoneScreens");

function mount(over: Partial<Parameters<typeof usePhoneScreens>[0]> = {}) {
  const props = {
    onNote: true,
    loaded: false,
    showHome: vi.fn(),
    showNote: vi.fn(),
    closeCaretMenus: vi.fn(() => false),
    ...over,
  };
  renderHook(() => usePhoneScreens(props));
  return props;
}

const pressBack = async () => {
  await waitFor(() => expect(back.press).not.toBeNull());
  back.press?.();
};

beforeEach(() => {
  back.press = null;
  back.minimize.mockClear();
  localStorage.clear();
});
afterEach(cleanup);

describe("Back on the phone", () => {
  it("closes a menu under the caret and stays on the note", async () => {
    // The slash menu listens in the note's text; Back's Escape goes to the
    // page, so the menu stood over Home and still edited the hidden note.
    const props = mount({ closeCaretMenus: vi.fn(() => true) });
    await pressBack();
    expect(props.closeCaretMenus).toHaveBeenCalled();
    expect(props.showHome).not.toHaveBeenCalled();
  });

  it("leaves a surface that takes Escape to close itself", async () => {
    const dialog = document.createElement("input");
    dialog.addEventListener("keydown", (e) => e.key === "Escape" && e.preventDefault());
    document.body.append(dialog);
    dialog.focus();
    const props = mount();
    await pressBack();
    expect(props.closeCaretMenus).not.toHaveBeenCalled();
    expect(props.showHome).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("goes from the note to Home when nothing is open", async () => {
    const props = mount();
    await pressBack();
    expect(props.showHome).toHaveBeenCalled();
    expect(back.minimize).not.toHaveBeenCalled();
  });

  it("puts the app in the background from Home", async () => {
    const props = mount({ onNote: false });
    await pressBack();
    expect(props.showHome).not.toHaveBeenCalled();
    expect(back.minimize).toHaveBeenCalled();
  });
});

describe("leaving and coming back", () => {
  it("reopens the note that was on screen when Android closed the app", () => {
    localStorage.setItem("boojy-phone-left", JSON.stringify({ screen: "note", at: Date.now() }));
    const props = mount({ loaded: true });
    expect(props.showNote).toHaveBeenCalledTimes(1);
  });

  it("opens Home when Home was on screen", () => {
    localStorage.setItem("boojy-phone-left", JSON.stringify({ screen: "home", at: Date.now() }));
    const props = mount({ loaded: true });
    expect(props.showNote).not.toHaveBeenCalled();
  });

  it("notes which screen was showing as the app leaves", () => {
    mount({ onNote: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(JSON.parse(localStorage.getItem("boojy-phone-left") ?? "{}").screen).toBe("note");
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});
