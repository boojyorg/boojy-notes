import { describe, it, expect } from "vitest";
import {
  BTN_GAP,
  CHROME_BTN,
  EDITOR_FLOOR_W,
  HEADER_RIGHT_INSET,
  MAC_TRAFFIC_INSET,
  SIDEBAR_HANDLE_W,
  SIDEBAR_HEADER_W,
  SIDEBAR_MIN_W,
  SIDEBAR_MAX_W,
  WINDOW_MIN_W,
  WORDMARK_W,
  sidebarMinFor,
  sidebarWidthFor,
  trafficInset,
} from "../../src/constants/layout";

// The sidebar yields before the note does: what is drawn is the dragged
// width capped by the room beside an editor at its floor, never below the
// sidebar's own minimum (2026-09-14).
describe("sidebarWidthFor", () => {
  it("draws the dragged width when the window has room", () => {
    expect(sidebarWidthFor(380, 1200)).toBe(380);
    expect(sidebarWidthFor(SIDEBAR_MAX_W, 1200)).toBe(SIDEBAR_MAX_W);
  });

  it("caps it so the editor keeps its floor", () => {
    expect(sidebarWidthFor(380, 600)).toBe(600 - SIDEBAR_HANDLE_W - EDITOR_FLOOR_W);
    expect(sidebarWidthFor(380, 700)).toBe(380);
  });

  it("never goes below the sidebar's minimum, whatever the window", () => {
    expect(sidebarWidthFor(380, WINDOW_MIN_W)).toBe(SIDEBAR_MIN_W);
    expect(sidebarWidthFor(380, 300)).toBe(SIDEBAR_MIN_W);
    expect(sidebarWidthFor(SIDEBAR_MIN_W, 1200)).toBe(SIDEBAR_MIN_W);
  });

  it("makes the window minimum the two floors and the handle", () => {
    expect(WINDOW_MIN_W).toBe(SIDEBAR_MIN_W + SIDEBAR_HANDLE_W + EDITOR_FLOOR_W);
  });

  // The minimum is the header row's own width plus air, never a number of its
  // own: at 200 the row's contents came to 226 on macOS once Search joined the
  // toggle (2026-09-16), and the toggle was clipped. Add a control to the row
  // and the minimum follows.
  it("keeps the header row whole at the sidebar's minimum", () => {
    expect(SIDEBAR_HEADER_W).toBe(
      MAC_TRAFFIC_INSET + WORDMARK_W + 2 * CHROME_BTN + BTN_GAP + HEADER_RIGHT_INSET,
    );
    expect(SIDEBAR_MIN_W).toBeGreaterThan(SIDEBAR_HEADER_W);
  });

  // The traffic lights are the system's and keep their size (they end 75px
  // in), so the room they take is one distance on screen; the air after them
  // is the app's, so it grows with the interface and never shrinks below 100%'s.
  it("clears the traffic lights by air that grows with the scale and never shrinks", () => {
    const air = MAC_TRAFFIC_INSET - 75;
    for (const scale of [0.5, 0.8, 1]) {
      expect(trafficInset(scale) * scale).toBeCloseTo(75 + air);
    }
    for (const scale of [1.5, 2]) {
      expect(trafficInset(scale) * scale).toBeCloseTo(75 + air * scale);
    }
    expect(trafficInset()).toBe(MAC_TRAFFIC_INSET);
  });

  it("widens the sidebar's minimum by what the inset takes below 100%, never narrows it", () => {
    expect(sidebarMinFor(1)).toBe(SIDEBAR_MIN_W);
    expect(sidebarMinFor(0.5)).toBe(SIDEBAR_MIN_W + MAC_TRAFFIC_INSET);
    expect(sidebarMinFor(2)).toBe(SIDEBAR_MIN_W);
    // The drawn width honours the minimum it is given.
    expect(sidebarWidthFor(SIDEBAR_MIN_W, 1200, sidebarMinFor(0.5))).toBe(sidebarMinFor(0.5));
  });
});
