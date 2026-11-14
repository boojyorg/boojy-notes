import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/platform", () => ({ isPhone: true }));

import { switchScreen } from "../../src/phone/screenMotion";

const reduced = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on, media: q })) as typeof window.matchMedia;
};
const ghosts = () => [...document.querySelectorAll<HTMLElement>(".screen-ghost")];
const app = () => document.getElementById("root") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  reduced(false);
  document.body.innerHTML = `<div id="root"><div id="screen" data-screen-name="home">
    <input value="typed" /><p contenteditable="true" autofocus>Home</p></div></div>`;
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

describe("switchScreen", () => {
  it("makes the change at once, whichever way it goes", () => {
    for (const to of ["note", "home"] as const) {
      const change = vi.fn();
      switchScreen(to, change);
      expect(change).toHaveBeenCalledOnce();
    }
  });

  it("to the note: a copy of the screen left stands under the app as it arrives", () => {
    switchScreen("note", () => {
      document.getElementById("screen")!.textContent = "Note";
    });
    const [ghost] = ghosts();
    expect(ghost.classList.contains("screen-under")).toBe(true);
    // The copy is of the screen before the change.
    expect(ghost.textContent).toContain("Home");
    expect(app().classList.contains("screen-in")).toBe(true);
    vi.runAllTimers();
    expect(ghosts()).toHaveLength(0);
    expect(app().classList.contains("screen-in")).toBe(false);
  });

  it("to Home: a copy of the note leaves over the app, which does not move", () => {
    switchScreen("home", () => {});
    expect(ghosts()[0].classList.contains("screen-out")).toBe(true);
    expect(app().classList.contains("screen-in")).toBe(false);
    vi.runAllTimers();
    expect(ghosts()).toHaveLength(0);
  });

  it("the copy cannot be reached, focused or typed in, and keeps what a field held", () => {
    (document.querySelector("input") as HTMLInputElement).value = "newer";
    switchScreen("home", () => {});
    const [ghost] = ghosts();
    expect(ghost.hasAttribute("inert")).toBe(true);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.id).toBe("");
    expect(ghost.querySelector("[id], [autofocus], [contenteditable]")).toBeNull();
    expect(ghost.querySelector("input")?.value).toBe("newer");
    // The note's look is written against its data attributes, so they stay.
    expect(ghost.querySelector("[data-screen-name]")).not.toBeNull();
    // The app's own node is still the first a lookup finds.
    expect(document.querySelector("[data-screen-name]")?.id).toBe("screen");
  });

  it("a second change starts from rest: one copy, and no arrival left running", () => {
    switchScreen("note", () => {});
    switchScreen("home", () => {});
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0].classList.contains("screen-out")).toBe(true);
    expect(app().classList.contains("screen-in")).toBe(false);
  });

  it("only changes, with no copy, when motion is reduced or the screen is put back", () => {
    reduced(true);
    const change = vi.fn();
    switchScreen("note", change);
    reduced(false);
    switchScreen("note", change, false);
    expect(change).toHaveBeenCalledTimes(2);
    expect(ghosts()).toHaveLength(0);
    expect(app().classList.contains("screen-in")).toBe(false);
  });
});
