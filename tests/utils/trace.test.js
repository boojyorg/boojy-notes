import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The renderer half of the diagnostic trace reads `window.electronAPI` at
// import time, so each case imports a fresh module against its own bridge.
async function load(api) {
  vi.resetModules();
  if (api === undefined) delete window.electronAPI;
  else window.electronAPI = api;
  return import("../../src/utils/trace.js");
}

describe("trace (renderer)", () => {
  afterEach(() => {
    delete window.electronAPI;
    document.body.innerHTML = "";
  });

  it("is a no-op with no bridge, and without the flag", async () => {
    let mod = await load(undefined);
    expect(mod.traceEnabled).toBe(false);
    expect(() => mod.trace("anything")).not.toThrow();

    const trace = vi.fn();
    mod = await load({ traceEnabled: false, trace });
    mod.trace("still", "nothing");
    mod.installTraceProbes();
    document.dispatchEvent(new Event("selectionchange"));
    expect(trace).not.toHaveBeenCalled();
  });

  it("joins parts into one line for the main process when enabled", async () => {
    const trace = vi.fn();
    const mod = await load({ traceEnabled: true, trace });
    expect(mod.traceEnabled).toBe(true);
    mod.trace("write done", 42, "12ms");
    expect(trace).toHaveBeenCalledWith("write done 42 12ms");
  });

  describe("probes", () => {
    let trace;
    beforeEach(async () => {
      trace = vi.fn();
      const mod = await load({ traceEnabled: true, trace });
      document.body.innerHTML = `
        <div data-block-id="a" contenteditable="true">first</div>
        <div data-block-id="b" contenteditable="true">second</div>`;
      mod.installTraceProbes();
    });

    it("logs the caret's block index and id once per move, not per event", () => {
      const b = document.querySelector('[data-block-id="b"]');
      const range = document.createRange();
      range.setStart(b.firstChild, 3);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      document.dispatchEvent(new Event("selectionchange"));

      const caretLines = trace.mock.calls.map(([l]) => l).filter((l) => l.startsWith("caret →"));
      expect(caretLines).toEqual(["caret → #1/2 b offset 3"]);
    });

    it("logs every input with the block it lands in", () => {
      const a = document.querySelector('[data-block-id="a"]');
      const ev = new InputEvent("beforeinput", {
        inputType: "insertText",
        data: "x",
        bubbles: true,
      });
      a.dispatchEvent(ev);
      expect(trace).toHaveBeenCalledWith('input insertText "x" in #0/2 a');
    });

    it("logs window focus and blur", () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
      expect(trace).toHaveBeenCalledWith("window blur");
      expect(trace).toHaveBeenCalledWith("window focus");
    });
  });
});
