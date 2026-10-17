/** @vitest-environment jsdom */
/**
 * Recently Deleted's menu: one line a note, `Folder / Name`, no ages; the row
 * under the pointer or the arrows offers Restore and delete for good, and the
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
  const props = {
    items: list,
    restore: vi.fn(),
    purge: vi.fn(),
    onClose: vi.fn(),
    onEscape: vi.fn(),
    view: vi.fn(),
    viewingId: null,
  };
  render(<RecentlyDeletedMenu {...props} />);
  const menu = screen.getByRole("dialog", { name: "Recently Deleted" });
  return { props, menu };
}

describe("RecentlyDeletedMenu", () => {
  it("is one line a note, its folder then its name, and says how long they wait", () => {
    setup();
    const rows = screen.getAllByRole("option").map((o) => o.textContent);
    expect(rows).toEqual(["Projects / Old plan", "Loose"]);
    expect(document.body.textContent).toContain("Click a note to view it.");
    expect(document.body.textContent).toContain("Notes here are deleted after 30 days.");
  });

  it("shows a note on a click on its row, never on a click on its actions", () => {
    const { props } = setup();
    fireEvent.mouseEnter(screen.getAllByRole("option")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Restore “Old plan”" }));
    expect(props.view).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(props.view).toHaveBeenCalledWith(items[1]);
  });

  it("says when there is nothing in it", () => {
    setup([]);
    expect(document.body.textContent).toContain("Nothing deleted in the last 30 days.");
  });

  it("puts back and deletes for good from the pointer's row", () => {
    const { props } = setup();
    fireEvent.mouseEnter(screen.getAllByRole("option")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Restore “Old plan”" }));
    expect(props.restore).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Delete “Old plan” permanently" }));
    expect(props.purge).toHaveBeenCalledWith(items[0]);
  });

  it("takes the keys: arrows, Enter restores, Delete asks, Escape closes the list and the view", () => {
    const { props, menu } = setup();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(props.restore).toHaveBeenCalledWith("b");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "Delete" });
    expect(props.purge).toHaveBeenCalledWith(items[0]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(props.onEscape).toHaveBeenCalled();
  });

  it("closes on a press outside", () => {
    const { props } = setup();
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("RecentlyDeletedMenu keeps its keys", () => {
  // Restoring a row took the focused action with it; Escape (the phone's Back)
  // then went to the page and left the list open.
  it("takes focus back when the row whose action held it goes", () => {
    const props = {
      restore: vi.fn(),
      purge: vi.fn(),
      onClose: vi.fn(),
      onEscape: vi.fn(),
      view: vi.fn(),
      viewingId: null,
    };
    const { rerender } = render(<RecentlyDeletedMenu items={items} {...props} />);
    fireEvent.mouseEnter(screen.getAllByRole("option")[0]);
    screen.getByRole("button", { name: "Restore “Old plan”" }).focus();
    rerender(<RecentlyDeletedMenu items={items.slice(1)} {...props} />);
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Recently Deleted" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(props.onEscape).toHaveBeenCalled();
  });
});

// Beside the sidebar it stood off the phone's screen, and its actions waited
// for a hover a finger never makes.
describe("RecentlyDeletedMenu on the phone", () => {
  it("stands above its row across the screen, every row showing its actions", async () => {
    vi.resetModules();
    vi.doMock("../../src/utils/platform", async (actual) => ({
      ...(await actual<object>()),
      isPhone: true,
    }));
    const row = document.createElement("button");
    row.dataset.testid = "recently-deleted-row";
    row.getBoundingClientRect = () => ({ top: 700, bottom: 742, left: 0, right: 400 }) as DOMRect;
    document.body.append(row);
    try {
      const { default: PhoneMenu } = await import("../../src/components/RecentlyDeletedMenu");
      const { TOUCH } = await import("../../src/constants/layout.js");
      render(
        <PhoneMenu
          items={items}
          restore={vi.fn()}
          purge={vi.fn()}
          onClose={vi.fn()}
          onEscape={vi.fn()}
          view={vi.fn()}
          viewingId={null}
        />,
      );
      const menu = screen.getByRole("dialog", { name: "Recently Deleted" });
      expect(menu.style.left).toBe("16px");
      expect(menu.style.right).toBe("16px");
      expect(menu.style.bottom).toBe(`${window.innerHeight - 700 + 4}px`);
      for (const option of screen.getAllByRole("option")) {
        expect(option.style.height).toBe(`${TOUCH}px`);
        const restore = option.querySelector("button") as HTMLElement;
        expect(restore.parentElement?.style.visibility).toBe("visible");
        expect(restore.style.height).toBe(`${TOUCH}px`);
      }
      expect(document.body.textContent).toContain("Tap a note to view it.");
    } finally {
      row.remove();
      vi.doUnmock("../../src/utils/platform");
      vi.resetModules();
    }
  });
});
