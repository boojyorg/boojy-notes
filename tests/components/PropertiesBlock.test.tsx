/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#6F6861" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC" },
      ACCENT: { primary: "#8FC1C6" },
      SEMANTIC: { error: "#B3261E" },
      modalShadow: "none",
    },
  }),
}));

import PropertiesBlock, {
  FOLDED_PROPERTIES_KEY,
  numberTyping,
} from "../../src/components/PropertiesBlock";
import type { Block } from "../../src/types/notes";
import { type Change, runChange } from "../../src/utils/properties";

const TEXT = [
  "# Imported",
  "title: The Empire Strikes Back",
  "year: 1980",
  'episode: "05"',
  "favourite: true",
  "watched: 2026-12-01",
  "cast: [Mark Hamill, Harrison Ford]",
  "tags: [starwars]",
  "aliases: [Episode V]",
  "cssclasses:",
  "rating:",
  "source:",
  "  site: imdb",
].join("\n");

/** The block as a note would hold it: each change runs on the latest text, as editFrontmatter does. */
type Extra = Partial<Parameters<typeof PropertiesBlock>[0]>;
function Harness({
  initial,
  noteId,
  onText,
  extra = {},
}: {
  initial: string;
  noteId: string;
  onText: (t: string) => void;
  extra?: Extra;
}) {
  const [text, setText] = useState(initial);
  (Harness as unknown as { set: (t: string) => void }).set = setText;
  const block = { id: "fm", type: "frontmatter", text } as Block;
  return (
    <PropertiesBlock
      block={block}
      noteId={noteId}
      blockIndex={0}
      syncGen={0}
      {...extra}
      onUpdateText={(_, __, t) => onText(t)}
      onEditFrontmatter={(_, __, change: Change) => {
        const out = runChange(text, change);
        if (out === false) return "unsafe";
        if (out === null) return "none";
        setText(out);
        onText(out);
        return "ok";
      }}
    />
  );
}
/** A change from outside Boojy: the disk's text arriving. */
const fromDisk = (t: string) =>
  act(() => (Harness as unknown as { set: (t: string) => void }).set(t));

const setup = (text = TEXT, noteId = "n1", extra: Extra = {}) => {
  let latest = text;
  const onText = vi.fn((t: string) => {
    latest = t;
  });
  const r = render(<Harness initial={text} noteId={noteId} onText={onText} extra={extra} />);
  return { ...r, onText, text: () => latest };
};
const row = (c: HTMLElement, key: string) =>
  c.querySelector(`.props-row[data-key="${key}"]`) as HTMLElement;
const value = (c: HTMLElement, key: string) =>
  row(c, key).querySelector(".props-value") as HTMLElement;
const pills = (c: HTMLElement, key: string) =>
  [...row(c, key).querySelectorAll(".props-item-text")].map((p) => p.textContent);
const itemText = (c: HTMLElement, key: string, i: number) =>
  row(c, key).querySelector(`.props-item-text[data-index="${i}"]`) as HTMLElement;
const itemMenuRow = (label: string) =>
  [...document.querySelectorAll('[data-testid="property-item-menu"] [role^="menuitem"]')].find(
    (el) => el.textContent?.trim() === label,
  ) as HTMLElement;
const input = (c: HTMLElement) => c.querySelector(".props-input") as HTMLInputElement;
const iconLabel = (c: HTMLElement, key: string) =>
  row(c, key).querySelector(".props-icon")?.getAttribute("aria-label");
const menuRow = (label: string) =>
  [...document.querySelectorAll('[data-testid="property-menu"] [role^="menuitem"]')].find(
    (el) => el.textContent?.trim() === label,
  ) as HTMLElement;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("PropertiesBlock: rows", () => {
  it("shows each property as icon, name and value, open by default", () => {
    const { container: c } = setup();
    expect([...c.querySelectorAll(".props-name")].map((n) => n.textContent)).toEqual([
      "title",
      "year",
      "episode",
      "favourite",
      "watched",
      "cast",
      "tags",
      "aliases",
      "cssclasses",
      "rating",
      "source",
    ]);
    expect(value(c, "title").textContent).toBe("The Empire Strikes Back");
    expect(value(c, "watched").textContent).toBe("1 Dec 2026");
    expect(
      row(c, "favourite").querySelector('[role="checkbox"]')?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(pills(c, "cast")).toEqual(["Mark Hamill", "Harrison Ford"]);
    expect(row(c, "tags").querySelector(".props-tag")).not.toBeNull();
    expect(row(c, "rating").querySelector(".props-empty")).not.toBeNull();
    expect(value(c, "source").textContent).toBe("site: imdb");
  });

  it("names each type on its icon, and says plainly what Boojy doesn't use", () => {
    const { container: c } = setup();
    expect(iconLabel(c, "title")).toBe("title: Text. Change type");
    expect(iconLabel(c, "year")).toBe("year: Number. Change type");
    expect(iconLabel(c, "favourite")).toBe("favourite: Checkbox. Change type");
    expect(iconLabel(c, "watched")).toBe("watched: Date. Change type");
    expect(iconLabel(c, "cast")).toBe("cast: List. Change type");
    expect(iconLabel(c, "tags")).toBe("tags: Tags. Change type");
    expect(iconLabel(c, "rating")).toBe("rating: No type yet. Change type");
    expect(iconLabel(c, "source")).toBe("source: Changed only as YAML. Change type");
    expect(iconLabel(c, "aliases")).toMatch(/doesn't use them in links or Search yet/);
    expect(iconLabel(c, "cssclasses")).toMatch(/Boojy keeps it but doesn't use it/);
  });
});

describe("PropertiesBlock: editing in place", () => {
  it("a value edits in place: Enter commits only its own line", () => {
    const { container: c, text } = setup();
    fireEvent.click(value(c, "title").querySelector("button") as HTMLElement);
    const field = input(c);
    expect(field.value).toBe("The Empire Strikes Back");
    expect(row(c, "title").hasAttribute("data-editing")).toBe(true);
    fireEvent.change(field, { target: { value: "Return of the Jedi" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(text()).toBe(TEXT.replace("The Empire Strikes Back", "Return of the Jedi"));
    expect(input(c)).toBeNull();
  });

  it("opening a value and leaving it changes nothing, even with spaces at its ends", () => {
    const { container: c, onText } = setup('title: "  A  "');
    fireEvent.click(value(c, "title").querySelector("button") as HTMLElement);
    expect(input(c).value).toBe("  A  ");
    fireEvent.blur(input(c));
    expect(onText).not.toHaveBeenCalled();
  });

  it("text is written as typed, spaces and all", () => {
    const { container: c, text } = setup("title: A");
    fireEvent.click(value(c, "title").querySelector("button") as HTMLElement);
    fireEvent.change(input(c), { target: { value: " B " } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe('title: " B "');
  });

  it("Escape and ⌘Z on a changed draft leave the file as it was", () => {
    const { container: c, onText } = setup();
    fireEvent.click(value(c, "title").querySelector("button") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "x" } });
    fireEvent.keyDown(input(c), { key: "Escape" });
    fireEvent.click(value(c, "year").querySelector("button") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "1999" } });
    fireEvent.keyDown(input(c), { key: "z", metaKey: true });
    expect(input(c)).toBeNull();
    expect(onText).not.toHaveBeenCalled();
  });

  it("a number field takes only digits, one point and a leading minus", () => {
    const { container: c, text } = setup();
    fireEvent.click(value(c, "year").querySelector("button") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "19a8x.2.5" } });
    expect(input(c).value).toBe("198.25");
    fireEvent.change(input(c), { target: { value: "-" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(c.querySelector(".props-error")?.textContent).toMatch(/Numbers only/);
    fireEvent.change(input(c), { target: { value: "1981" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe(TEXT.replace("year: 1980", "year: 1981"));
  });

  it("the name renames, and refuses a name already used", () => {
    const { container: c, text } = setup();
    fireEvent.click(row(c, "year").querySelector(".props-name") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "title" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(c.querySelector(".props-error")?.textContent).toMatch(/already called/);
    fireEvent.change(input(c), { target: { value: "released" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe(TEXT.replace("year: 1980", "released: 1980"));
  });

  it("the tick box ticks", () => {
    const { container: c, text } = setup();
    fireEvent.click(row(c, "favourite").querySelector('[role="checkbox"]') as HTMLElement);
    expect(text()).toBe(TEXT.replace("favourite: true", "favourite: false"));
  });

  it("a pill's × removes it; a list edits by adding, Enter on empty finishing", () => {
    const { container: c, text } = setup();
    fireEvent.click(
      row(c, "cast").querySelector('[aria-label="Remove Mark Hamill"]') as HTMLElement,
    );
    expect(text()).toBe(TEXT.replace("[Mark Hamill, Harrison Ford]", "[Harrison Ford]"));
    fireEvent.click(row(c, "cast").querySelector(".props-list") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "Carrie Fisher" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe(
      TEXT.replace("[Mark Hamill, Harrison Ford]", "[Harrison Ford, Carrie Fisher]"),
    );
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(input(c)).toBeNull();
  });

  it("a click on an item edits it in place: Enter saves and opens the next, Escape cancels", () => {
    const { container: c, text } = setup();
    fireEvent.click(itemText(c, "cast", 0));
    expect(input(c).value).toBe("Mark Hamill");
    fireEvent.change(input(c), { target: { value: "Mark Hamil" } });
    fireEvent.keyDown(input(c), { key: "Escape" });
    expect(input(c)).toBeNull();
    expect(text()).toBe(TEXT);
    fireEvent.click(itemText(c, "cast", 0));
    fireEvent.change(input(c), { target: { value: "Mark Hamil" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe(TEXT.replace("[Mark Hamill,", "[Mark Hamil,"));
    // A new, empty item now waits after it; Enter on it, empty, closes it.
    expect(input(c).value).toBe("");
    fireEvent.change(input(c), { target: { value: "Carrie" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe(
      TEXT.replace("[Mark Hamill, Harrison Ford]", "[Mark Hamil, Carrie, Harrison Ford]"),
    );
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(input(c)).toBeNull();
  });

  it("an item being edited keeps its ×, which removes it without saving the draft", () => {
    const { container: c, text } = setup();
    fireEvent.click(itemText(c, "cast", 0));
    fireEvent.change(input(c), { target: { value: "Half-typed" } });
    const x = row(c, "cast").querySelector('[aria-label="Remove Mark Hamill"]') as HTMLElement;
    expect(x).not.toBeNull();
    fireEvent.mouseDown(x);
    fireEvent.click(x);
    expect(text()).toBe(TEXT.replace("[Mark Hamill, Harrison Ford]", "[Harrison Ford]"));
    expect(input(c)).toBeNull();
  });

  it("an item emptied and saved goes; a comma is text in a list", () => {
    const { container: c, text } = setup();
    fireEvent.click(itemText(c, "cast", 1));
    fireEvent.change(input(c), { target: { value: "" } });
    fireEvent.blur(input(c));
    expect(text()).toBe(TEXT.replace("[Mark Hamill, Harrison Ford]", "[Mark Hamill]"));
    fireEvent.click(row(c, "cast").querySelector(".props-list") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "Fisher, Carrie" } });
    fireEvent.keyDown(input(c), { key: "," });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe(
      TEXT.replace("[Mark Hamill, Harrison Ford]", '[Mark Hamill, "Fisher, Carrie"]'),
    );
  });

  it("Backspace in an empty new item picks the item before it, and a second removes it", () => {
    const { container: c, text } = setup();
    fireEvent.click(row(c, "cast").querySelector(".props-list") as HTMLElement);
    fireEvent.keyDown(input(c), { key: "Backspace" });
    expect(row(c, "cast").querySelector("[data-armed]")?.textContent).toMatch(/^Harrison Ford/);
    expect(text()).toBe(TEXT);
    // Typing lets it go.
    fireEvent.change(input(c), { target: { value: "x" } });
    expect(row(c, "cast").querySelector("[data-armed]")).toBeNull();
    fireEvent.change(input(c), { target: { value: "" } });
    fireEvent.keyDown(input(c), { key: "Backspace" });
    fireEvent.keyDown(input(c), { key: "Backspace" });
    expect(text()).toBe(TEXT.replace("[Mark Hamill, Harrison Ford]", "[Mark Hamill]"));
    expect(input(c)).not.toBeNull();
  });

  it("a tag ends at a space or a comma, a typed # is the pill's, and a tag must read as one", () => {
    const { container: c, text } = setup();
    fireEvent.click(row(c, "tags").querySelector(".props-list") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "#scifi" } });
    expect(input(c).value).toBe("scifi");
    fireEvent.keyDown(input(c), { key: " " });
    expect(text()).toBe(TEXT.replace("tags: [starwars]", "tags: [starwars, scifi]"));
    fireEvent.change(input(c), { target: { value: "9lives" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(row(c, "tags").querySelector(".props-error")?.textContent).toMatch(
      /starts with a letter/,
    );
    expect(text()).toBe(TEXT.replace("tags: [starwars]", "tags: [starwars, scifi]"));
  });

  it("an empty list says Empty and adds from it; a focused item's Delete removes it", () => {
    const { container: c, text, getByRole } = setup("cast: []\ntags: [a, b]");
    fireEvent.click(getByRole("button", { name: "Add to cast" }));
    fireEvent.change(input(c), { target: { value: "Mark" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe("cast: [Mark]\ntags: [a, b]");
    fireEvent.keyDown(input(c), { key: "Escape" });
    fireEvent.keyDown(itemText(c, "tags", 0), { key: "Delete" });
    expect(text()).toBe("cast: [Mark]\ntags: [b]");
  });

  it("an edit to a property changed outside meanwhile is set aside, with Restore", () => {
    const { container: c, text } = setup();
    fireEvent.click(value(c, "title").querySelector("button") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "Mine" } });
    fromDisk(TEXT.replace("The Empire Strikes Back", "Theirs"));
    expect(input(c)).toBeNull();
    expect(value(c, "title").textContent).toMatch(/^Theirs/);
    expect(row(c, "title").querySelector(".props-notice")?.textContent).toMatch(
      /title changed outside Boojy, so your edit wasn't saved/,
    );
    fireEvent.click(row(c, "title").querySelector(".props-restore") as HTMLElement);
    expect(input(c).value).toBe("Mine");
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe(TEXT.replace("The Empire Strikes Back", "Mine"));
  });

  it("an edit whose property is renamed outside keeps the draft in reach", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const { container: c } = setup();
    fireEvent.click(value(c, "title").querySelector("button") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "Mine" } });
    fromDisk(TEXT.replace("title:", "renamed:"));
    const lost = c.querySelector(".props-notice[data-lost]") as HTMLElement;
    expect(lost.textContent).toMatch(
      /Your edit to “title” wasn't saved: it was renamed or removed outside Boojy\. It read “Mine”/,
    );
    fireEvent.click(
      [...lost.querySelectorAll("button")].find(
        (b) => b.textContent === "Copy my edit",
      ) as HTMLElement,
    );
    expect(writeText).toHaveBeenCalledWith("Mine");
    expect(c.querySelector(".props-notice[data-lost]")).toBeNull();
  });

  it("an edit survives a change to another property from outside", () => {
    const { container: c } = setup();
    fireEvent.click(value(c, "title").querySelector("button") as HTMLElement);
    fireEvent.change(input(c), { target: { value: "Mine" } });
    fromDisk(TEXT.replace("year: 1980", "year: 1981"));
    expect(input(c).value).toBe("Mine");
  });
});

describe("PropertiesBlock: the type menu", () => {
  it("the row a menu is about is marked while it is open", () => {
    const { container: c } = setup();
    fireEvent.click(row(c, "year").querySelector(".props-icon") as HTMLElement);
    expect(row(c, "year").hasAttribute("data-menu")).toBe(true);
    expect(row(c, "title").hasAttribute("data-menu")).toBe(false);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    fireEvent.contextMenu(itemText(c, "cast", 0));
    expect(row(c, "cast").hasAttribute("data-menu")).toBe(true);
    expect(row(c, "year").hasAttribute("data-menu")).toBe(false);
  });

  it("the title's menu: Show Markdown, and Remove all properties", () => {
    const onRemoveAll = vi.fn();
    const onShowMarkdown = vi.fn();
    const { container: c } = setup(TEXT, "n1", { onRemoveAll, onShowMarkdown });
    const title = c.querySelector(".props-title") as HTMLElement;
    fireEvent.contextMenu(title);
    expect(title.hasAttribute("data-menu")).toBe(true);
    const item = (label: string) =>
      [...document.querySelectorAll('[data-testid="properties-menu"] [role^="menuitem"]')].find(
        (el) => el.textContent?.includes(label),
      ) as HTMLElement;
    fireEvent.click(item("Show Markdown"));
    expect(onShowMarkdown).toHaveBeenCalledOnce();
    expect(title.hasAttribute("data-menu")).toBe(false);
    fireEvent.keyDown(title, { key: "F10", shiftKey: true });
    fireEvent.click(item("Remove all properties"));
    expect(onRemoveAll).toHaveBeenCalledWith("n1", "fm");
  });

  it("lists the six types with the current one ticked, then Remove", () => {
    const { container: c } = setup();
    fireEvent.click(row(c, "year").querySelector(".props-icon") as HTMLElement);
    const rows = [...document.querySelectorAll('[data-testid="property-menu"] [role^="menuitem"]')];
    expect(rows.map((r) => r.textContent?.trim())).toEqual([
      "Text",
      "List",
      "Number",
      "Checkbox",
      "Date",
      "Date & time",
      "Remove",
    ]);
    expect(menuRow("Number").getAttribute("aria-checked")).toBe("true");
  });

  it("a lossless change applies at once", () => {
    const { container: c, text } = setup();
    fireEvent.click(row(c, "year").querySelector(".props-icon") as HTMLElement);
    fireEvent.click(menuRow("Text"));
    expect(text()).toBe(TEXT.replace("year: 1980", 'year: "1980"'));
  });

  it("a lossy change asks first: Keep leaves it, Change makes it", () => {
    const { container: c, text, onText } = setup();
    fireEvent.click(row(c, "episode").querySelector(".props-icon") as HTMLElement);
    fireEvent.click(menuRow("Number"));
    expect(document.querySelector(".props-confirm")?.textContent).toMatch(/“05” will become 5/);
    fireEvent.click(menuRow("Keep as Text"));
    expect(onText).not.toHaveBeenCalled();
    fireEvent.click(row(c, "episode").querySelector(".props-icon") as HTMLElement);
    fireEvent.click(menuRow("Number"));
    fireEvent.click(menuRow("Change"));
    expect(text()).toBe(TEXT.replace('episode: "05"', "episode: 5"));
  });

  it("Remove takes the property; right-click opens the same menu", () => {
    const { container: c, text } = setup();
    fireEvent.contextMenu(row(c, "watched"));
    fireEvent.click(menuRow("Remove"));
    expect(text()).toBe(TEXT.replace("watched: 2026-12-01\n", ""));
  });

  it("a type chosen for an empty value shows until the note closes", () => {
    const { container: c } = setup();
    fireEvent.click(row(c, "rating").querySelector(".props-icon") as HTMLElement);
    fireEvent.click(menuRow("Number"));
    expect(iconLabel(c, "rating")).toBe("rating: Number. Change type");
  });
});

describe("PropertiesBlock: folding and the YAML", () => {
  it("folds to its header, unmounting the rows, and remembers it per note", () => {
    const { container: c } = setup();
    fireEvent.click(c.querySelector(".props-title") as HTMLElement);
    expect(c.querySelectorAll(".props-row")).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(FOLDED_PROPERTIES_KEY) as string)).toEqual(["n1"]);
    cleanup();
    expect(setup(TEXT, "n1").container.querySelectorAll(".props-row")).toHaveLength(0);
    cleanup();
    expect(setup(TEXT, "n2").container.querySelectorAll(".props-row").length).toBeGreaterThan(0);
  });

  it("folding with a field focused hands focus to the title, never to nothing", () => {
    const { container: c } = setup();
    fireEvent.click(value(c, "title").querySelector("button") as HTMLElement);
    expect(document.activeElement).toBe(input(c));
    fireEvent.click(c.querySelector(".props-title") as HTMLElement);
    expect(c.querySelectorAll(".props-row")).toHaveLength(0);
    expect(document.activeElement).toBe(c.querySelector(".props-title"));
  });

  it("a value the rows can't show opens the YAML, a field that commits what is typed", () => {
    const { container: c, getByRole, onText } = setup();
    fireEvent.click(value(c, "source").querySelector("button") as HTMLElement);
    const field = c.querySelector(".props-yaml-field") as HTMLTextAreaElement;
    expect(field.value).toBe(TEXT);
    fireEvent.input(field, { target: { value: `${TEXT}\nmood: calm` } });
    expect(onText).toHaveBeenCalledWith(`${TEXT}\nmood: calm`);
    fireEvent.click(getByRole("button", { name: "Back to properties" }));
    expect(c.querySelector(".props-yaml-field")).toBeNull();
    expect(c.querySelectorAll(".props-row").length).toBeGreaterThan(0);
  });

  it("YAML the rows can't read opens as YAML, says so, and shows no rows", () => {
    const { container: c, queryByRole } = setup("tags: [a");
    expect((c.querySelector(".props-yaml-field") as HTMLTextAreaElement).value).toBe("tags: [a");
    expect(c.querySelector(".props-note")?.textContent).toMatch(/can't be shown as rows/);
    expect(c.querySelectorAll(".props-row")).toHaveLength(0);
    // No rows to go back to, so no way back is offered.
    expect(queryByRole("button", { name: "Back to properties" })).toBeNull();
  });

  it("a value the rows can't change opens the YAML", () => {
    const { container: c } = setup();
    fireEvent.click(value(c, "source").querySelector("button") as HTMLElement);
    expect(c.querySelector(".props-yaml-field")).not.toBeNull();
  });
});

describe("PropertiesBlock: a tag is the text's tag", () => {
  it("a tag's click edits it; its menu holds Search for it", () => {
    const onTagClick = vi.fn();
    const { container: c } = setup("tags: [starwars, demo]", "n1", { onTagClick });
    fireEvent.click(itemText(c, "tags", 1));
    expect(input(c).value).toBe("demo");
    expect(onTagClick).not.toHaveBeenCalled();
    fireEvent.keyDown(input(c), { key: "Escape" });
    fireEvent.contextMenu(itemText(c, "tags", 1));
    fireEvent.click(itemMenuRow("Search for #demo"));
    expect(onTagClick).toHaveBeenCalledWith("demo");
  });
});

describe("numberTyping", () => {
  it.each([
    ["19.2", "19.2"],
    ["19.a", "19."],
    ["22ria2", "222"],
    ["-4.5", "-4.5"],
    ["4-5", "45"],
    ["1.2.3", "1.23"],
    ["abc", ""],
  ])("%s → %s", (typed, kept) => {
    expect(numberTyping(typed)).toBe(kept);
  });
});

describe("PropertiesBlock: Add property", () => {
  const picker = () => document.querySelector('[data-testid="property-picker"]') as HTMLElement;
  const field = () => picker().querySelector("input") as HTMLInputElement;
  const rowsOf = () => [...picker().querySelectorAll('[role="option"]')].map((r) => r.textContent);

  it("opens on tags and the six types; a type's row is named in place and written once", () => {
    const { container: c, text } = setup("title: A");
    fireEvent.click(c.querySelector(".props-add") as HTMLElement);
    expect(rowsOf()).toEqual(["Tags", "Text", "List", "Number", "Checkbox", "Date", "Date & time"]);
    fireEvent.click(
      [...picker().querySelectorAll('[role="option"]')].find(
        (r) => r.textContent === "Number",
      ) as HTMLElement,
    );
    // A row named after its type, the name selected to be typed over; nothing written yet.
    const name = c.querySelector("[data-draft] input") as HTMLInputElement;
    expect(name.value).toBe("number");
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 6]);
    expect(text()).toBe("title: A");
    fireEvent.change(name, { target: { value: "mood" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(text()).toBe("title: A\nmood:");
    expect(iconLabel(c, "mood")).toBe("mood: Number. Change type");
    // The value is next.
    fireEvent.change(input(c), { target: { value: "4" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe("title: A\nmood: 4");
  });

  it("a draft: Escape writes nothing, a taken name gets a number, a bad one says why", () => {
    const { container: c, text } = setup("title: A\ndate: 2026-01-01");
    const pick = (label: string) => {
      fireEvent.click(c.querySelector(".props-add") as HTMLElement);
      fireEvent.click(
        [...picker().querySelectorAll('[role="option"]')].find(
          (r) => r.textContent === label,
        ) as HTMLElement,
      );
      return c.querySelector("[data-draft] input") as HTMLInputElement;
    };
    fireEvent.keyDown(pick("Text"), { key: "Escape" });
    expect(c.querySelector("[data-draft]")).toBeNull();
    expect(text()).toBe("title: A\ndate: 2026-01-01");
    const name = pick("Date");
    expect(name.value).toBe("date 2");
    fireEvent.change(name, { target: { value: "title" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(c.querySelector("[data-draft] .props-error")?.textContent).toMatch(/already called/);
    expect(text()).toBe("title: A\ndate: 2026-01-01");
    fireEvent.change(name, { target: { value: "watched" } });
    fireEvent.blur(name);
    expect(text()).toBe("title: A\ndate: 2026-01-01\nwatched:");
  });

  it("finds names other notes use as typed, with their type and how many use them", () => {
    const other = (text: string) => ({
      title: "o",
      folder: null,
      content: { title: "o", blocks: [{ id: "x", type: "frontmatter", text }] },
    });
    const { container: c, text } = setup("title: A", "n1", {
      noteDataRef: {
        current: { o1: other("rating: 3\nstatus: done"), o2: other("rating: 5") },
      } as never,
    });
    fireEvent.click(c.querySelector(".props-add") as HTMLElement);
    // Not offered until asked for.
    expect(rowsOf()).not.toContain("rating2 notes");
    fireEvent.change(field(), { target: { value: "rat" } });
    expect(rowsOf()).toEqual(["rating2 notes", "Add “rat”"]);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(text()).toBe("title: A\nrating:");
    expect(iconLabel(c, "rating")).toBe("rating: Number. Change type");
  });

  it("a typed name nobody uses asks its type", () => {
    const { container: c, text } = setup("title: A");
    fireEvent.click(c.querySelector(".props-add") as HTMLElement);
    fireEvent.change(field(), { target: { value: "mood" } });
    expect(rowsOf()).toEqual(["Add “mood”"]);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(rowsOf()).toEqual(["Text", "List", "Number", "Checkbox", "Date", "Date & time"]);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(text()).toBe("title: A\nmood:");
  });

  it("Escape leaves the note as it was; a section /properties made is taken away again", async () => {
    const { openBlock } = await import("../../src/utils/blockOpen");
    const onRemoveEmpty = vi.fn();
    setup("", "n1", { onRemoveEmpty });
    act(() => openBlock("fm", "add-new"));
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    expect(picker()).not.toBeNull();
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(picker()).toBeNull();
    expect(onRemoveEmpty).toHaveBeenCalledWith("n1", "fm");
  });
});
