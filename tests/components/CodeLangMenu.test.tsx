/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
      modalShadow: "none",
    },
    isDark: false,
  }),
}));

import CodeLangMenu, { typeAheadIndex } from "../../src/components/CodeLangMenu";

const LANGUAGES = [
  { value: "", label: "Plain" },
  { value: "bash", label: "Bash" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "typescript", label: "TypeScript" },
];

const anchor = { top: 100, bottom: 120, left: 400, right: 460 };

function mount(lang = "") {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <CodeLangMenu
      anchor={anchor}
      languages={LANGUAGES}
      lang={lang}
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
  const menu = document.body.querySelector('[data-testid="code-lang-menu"]') as HTMLElement;
  return { ...view, menu, onSelect, onClose };
}

const labels = (menu: HTMLElement) =>
  [...menu.querySelectorAll('[role="menuitemradio"]')].map((b) => b.textContent);

afterEach(cleanup);

describe("CodeLangMenu", () => {
  it("is a menu of radio items, Plain first and the rest alphabetical", () => {
    const { menu } = mount();
    expect(menu.getAttribute("aria-label")).toBe("Code language");
    expect(labels(menu)).toEqual([
      "Plain",
      "Bash",
      "CSS",
      "HTML",
      "JavaScript",
      "JSON",
      "Python",
      "SQL",
      "TypeScript",
    ]);
  });

  // The chosen language is marked with a check, as Sort marks its mode: the
  // accent as a marker, never a surface.
  it("checks the block's own language and nothing else", () => {
    const { menu } = mount("python");
    const checked = [...menu.querySelectorAll('[role="menuitemradio"]')].filter(
      (b) => b.getAttribute("aria-checked") === "true",
    );
    expect(checked.map((b) => b.textContent)).toEqual(["Python"]);
    expect(menu.querySelectorAll('[data-testid="code-lang-check"]')).toHaveLength(1);
  });

  it("chooses a language on click and closes", () => {
    const { menu, onSelect, onClose } = mount();
    const row = [...menu.querySelectorAll('[role="menuitemradio"]')].find(
      (b) => b.textContent === "SQL",
    ) as HTMLElement;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("sql");
    expect(onClose).toHaveBeenCalled();
  });

  // The keys are the menu element's own, not the document's: a portal leaves
  // the DOM but not the React tree, and the editor under it claimed Enter
  // before any document listener ran (2026-09-19).
  it("takes its keys on the menu itself, and stops them there", () => {
    const { menu, onSelect } = mount();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(menu.getAttribute("aria-activedescendant")).toBe("code-lang-item-0");
    const enter = fireEvent.keyDown(menu, { key: "Enter" });
    // fireEvent returns false when a handler called preventDefault.
    expect(enter).toBe(false);
    expect(onSelect).toHaveBeenCalledWith("");
  });

  it("jumps to a language as its name is typed, and Escape closes", () => {
    const { menu, onSelect, onClose } = mount();
    fireEvent.keyDown(menu, { key: "t" });
    expect(menu.getAttribute("aria-activedescendant")).toBe("code-lang-item-8");
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("typescript");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("walks the matches when the same letter is pressed again", () => {
    const { menu } = mount();
    fireEvent.keyDown(menu, { key: "p" });
    expect(menu.getAttribute("aria-activedescendant")).toBe("code-lang-item-0"); // Plain
    fireEvent.keyDown(menu, { key: "p" });
    expect(menu.getAttribute("aria-activedescendant")).toBe("code-lang-item-6"); // Python
  });
});

describe("typeAheadIndex", () => {
  const names = LANGUAGES.map((l) => l.label);

  it("takes the first match for a fresh buffer and the next for a repeat", () => {
    expect(typeAheadIndex(names, "j", -1)).toBe(4); // JavaScript
    expect(typeAheadIndex(names, "jj", 4)).toBe(5); // JSON
    expect(typeAheadIndex(names, "js", -1)).toBe(5); // JSON by name
    expect(typeAheadIndex(names, "pyt", -1)).toBe(6);
  });

  it("wraps, ignores case, and answers -1 for a name no row carries", () => {
    expect(typeAheadIndex(names, "b", 5)).toBe(1);
    expect(typeAheadIndex(names, "SQ", -1)).toBe(7);
    expect(typeAheadIndex(names, "z", -1)).toBe(-1);
  });
});
