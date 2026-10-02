/** @vitest-environment jsdom */
/**
 * The Sort menu: a row is active only while the pointer is on it or the arrows
 * put it there, so Enter after the pointer leaves chooses nothing.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#6F6861" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC" },
      ACCENT: { text: "#2F6F73" },
      modalShadow: "none",
    },
  }),
}));

import SortMenu from "../../src/components/SortMenu";

afterEach(cleanup);

function setup() {
  const props = {
    anchor: { top: 0, bottom: 20, left: 0, right: 40 },
    sortMode: "recent",
    setSortMode: vi.fn(),
    onClose: vi.fn(),
  };
  render(<SortMenu {...props} />);
  return { props, rows: screen.getAllByRole("menuitemradio") };
}

describe("SortMenu", () => {
  it("leaving a row clears it, so Enter then chooses nothing", () => {
    const { props, rows } = setup();
    fireEvent.mouseEnter(rows[1]);
    expect(rows[1].style.background).not.toBe("none");
    fireEvent.mouseLeave(rows[1]);
    expect(rows[1].style.background).toBe("none");
    fireEvent.keyDown(document, { key: "Enter" });
    expect(props.setSortMode).not.toHaveBeenCalled();
  });

  it("chooses the hovered row with Enter", () => {
    const { props, rows } = setup();
    fireEvent.mouseEnter(rows[1]);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(props.setSortMode).toHaveBeenCalledWith("alpha");
    expect(props.onClose).toHaveBeenCalled();
  });
});
