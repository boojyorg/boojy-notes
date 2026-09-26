/** @vitest-environment jsdom */
/**
 * Recently Deleted's menu: one line a note, `Folder / Name`, no ages; the row
 * under the pointer or the arrows offers put back and delete for good, and the
 * keys do the same; Escape or a press outside closes it.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#6F6861" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", editor: "#FFFFFF" },
      modalShadow: "none",
    },
  }),
}));

import RecentlyDeletedMenu from "../../src/components/RecentlyDeletedMenu";

afterEach(cleanup);

const items = [
  { id: "a", name: "Old plan", folder: "Projects", at: 2 },
  { id: "b", name: "Loose", folder: "", at: 1 },
];

function setup(list = items) {
  const props = { items: list, restore: vi.fn(), purge: vi.fn(), onClose: vi.fn() };
  render(<RecentlyDeletedMenu {...props} />);
  const menu = screen.getByRole("dialog", { name: "Recently Deleted" });
  return { props, menu };
}

describe("RecentlyDeletedMenu", () => {
  it("is one line a note, its folder then its name, and says how long they wait", () => {
    setup();
    const rows = screen.getAllByRole("option").map((o) => o.textContent);
    expect(rows).toEqual(["Projects / Old plan", "Loose"]);
    expect(document.body.textContent).toContain("Notes here are deleted after 30 days.");
  });

  it("says when there is nothing in it", () => {
    setup([]);
    expect(document.body.textContent).toContain("Nothing deleted in the last 30 days.");
  });

  it("puts back and deletes for good from the pointer's row", () => {
    const { props } = setup();
    fireEvent.mouseEnter(screen.getAllByRole("option")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Put back “Old plan”" }));
    expect(props.restore).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Delete “Old plan” permanently" }));
    expect(props.purge).toHaveBeenCalledWith(items[0]);
  });

  it("takes the keys: arrows, Enter puts back, Delete asks, Escape closes", () => {
    const { props, menu } = setup();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(props.restore).toHaveBeenCalledWith("b");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "Delete" });
    expect(props.purge).toHaveBeenCalledWith(items[0]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("closes on a press outside", () => {
    const { props } = setup();
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(props.onClose).toHaveBeenCalled();
  });
});
