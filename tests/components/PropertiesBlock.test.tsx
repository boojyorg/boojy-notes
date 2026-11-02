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
  [...row(c, key).querySelectorAll(".props-pill")].map((p) => p.firstChild?.textContent);
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

  it("</> shows the YAML as a field that commits what is typed", () => {
    const { container: c, getByRole, onText } = setup();
    fireEvent.click(getByRole("button", { name: "Edit as YAML" }));
    const field = c.querySelector(".props-yaml-field") as HTMLTextAreaElement;
    expect(field.value).toBe(TEXT);
    fireEvent.input(field, { target: { value: `${TEXT}\nmood: calm` } });
    expect(onText).toHaveBeenCalledWith(`${TEXT}\nmood: calm`);
  });

  it("YAML the rows can't read opens as YAML, says so, and shows no rows", () => {
    const { container: c, getByRole } = setup("tags: [a");
    expect((c.querySelector(".props-yaml-field") as HTMLTextAreaElement).value).toBe("tags: [a");
    expect(c.querySelector(".props-note")?.textContent).toMatch(/can't be shown as rows/);
    expect(c.querySelectorAll(".props-row")).toHaveLength(0);
    expect(getByRole("button", { name: "Back to properties" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("a value the rows can't change opens the YAML", () => {
    const { container: c } = setup();
    fireEvent.click(value(c, "source").querySelector("button") as HTMLElement);
    expect(c.querySelector(".props-yaml-field")).not.toBeNull();
  });
});

describe("PropertiesBlock: a tag is the text's tag", () => {
  it("a tag pill opens Search for that tag, and doesn't start an edit", () => {
    const onTagClick = vi.fn();
    const block = { id: "fm", type: "frontmatter", text: "tags: [starwars, demo]" } as Block;
    const { container: c } = render(
      <PropertiesBlock
        block={block}
        noteId="n1"
        blockIndex={0}
        syncGen={0}
        onUpdateText={() => {}}
        onTagClick={onTagClick}
      />,
    );
    fireEvent.click(c.querySelector('[data-tag="demo"]') as HTMLElement);
    expect(onTagClick).toHaveBeenCalledWith("demo");
    expect(c.querySelector(".props-input")).toBeNull();
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

  it("a name of your own, then its type: added last, its value open to type", () => {
    const { container: c, text } = setup("title: A");
    fireEvent.click(c.querySelector(".props-add") as HTMLElement);
    expect(rowsOf()).toEqual(["tags", "Custom property"]);
    fireEvent.change(field(), { target: { value: "mood" } });
    expect(rowsOf()).toEqual(["Add “mood”"]);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(rowsOf()).toEqual(["Text", "List", "Number", "Checkbox", "Date", "Date & time"]);
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(text()).toBe("title: A\nmood:");
    expect(iconLabel(c, "mood")).toBe("mood: Number. Change type");
    fireEvent.change(input(c), { target: { value: "4" } });
    fireEvent.keyDown(input(c), { key: "Enter" });
    expect(text()).toBe("title: A\nmood: 4");
  });

  it("offers names other notes use, with the type this device remembers", () => {
    localStorage.setItem("boojy-property-types", JSON.stringify({ rating: "number" }));
    const other = {
      title: "o",
      folder: null,
      content: {
        title: "o",
        blocks: [{ id: "x", type: "frontmatter", text: "rating: 3\nstatus: done" }],
      },
    };
    const { container: c, text } = setup("title: A", "n1", {
      noteDataRef: { current: { other } } as never,
    });
    fireEvent.click(c.querySelector(".props-add") as HTMLElement);
    expect(rowsOf()).toEqual(["tags", "rating", "status", "Custom property"]);
    fireEvent.change(field(), { target: { value: "rat" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(text()).toBe("title: A\nrating:");
    expect(iconLabel(c, "rating")).toBe("rating: Number. Change type");
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
