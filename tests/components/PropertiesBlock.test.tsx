/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PropertiesBlock, { FOLDED_PROPERTIES_KEY } from "../../src/components/PropertiesBlock";
import type { Block } from "../../src/types/notes";

const TEXT = [
  "# Imported",
  "title: The Empire Strikes Back",
  "year: 1980",
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

const setup = (text = TEXT, noteId = "n1") => {
  const onUpdateText = vi.fn();
  const block = { id: "fm", type: "frontmatter", text } as Block;
  const r = render(
    <PropertiesBlock
      block={block}
      noteId={noteId}
      blockIndex={0}
      syncGen={0}
      onUpdateText={onUpdateText}
    />,
  );
  return { ...r, onUpdateText };
};
const row = (c: HTMLElement, key: string) =>
  c.querySelector(`.props-row[data-key="${key}"]`) as HTMLElement;
const iconLabel = (c: HTMLElement, key: string) =>
  row(c, key).querySelector(".props-icon")?.getAttribute("aria-label");

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("PropertiesBlock: rows", () => {
  it("shows each property as icon, name and value, open by default", () => {
    const { container: c } = setup();
    expect([...c.querySelectorAll(".props-name")].map((n) => n.textContent)).toEqual([
      "title",
      "year",
      "favourite",
      "watched",
      "cast",
      "tags",
      "aliases",
      "cssclasses",
      "rating",
      "source",
    ]);
    expect(row(c, "title").querySelector(".props-value")?.textContent).toBe(
      "The Empire Strikes Back",
    );
    expect((row(c, "favourite").querySelector("input") as HTMLInputElement).checked).toBe(true);
    expect([...row(c, "cast").querySelectorAll(".props-pill")].map((p) => p.textContent)).toEqual([
      "Mark Hamill",
      "Harrison Ford",
    ]);
    expect(row(c, "tags").querySelector(".props-tag")?.textContent).toBe("starwars");
    expect(row(c, "rating").querySelector(".props-empty")).not.toBeNull();
    expect(row(c, "source").querySelector(".props-muted")?.textContent).toBe("site: imdb");
  });

  it("names each type, and says plainly what Boojy doesn't use", () => {
    const { container: c } = setup();
    expect(iconLabel(c, "title")).toBe("Text");
    expect(iconLabel(c, "year")).toBe("Number");
    expect(iconLabel(c, "favourite")).toBe("Checkbox");
    expect(iconLabel(c, "watched")).toBe("Date");
    expect(iconLabel(c, "cast")).toBe("List");
    expect(iconLabel(c, "tags")).toBe("Tags");
    expect(iconLabel(c, "rating")).toBe("No type yet");
    expect(iconLabel(c, "source")).toBe("Changed only as YAML");
    expect(iconLabel(c, "aliases")).toMatch(/doesn't use them in links or Search yet/);
    expect(iconLabel(c, "cssclasses")).toMatch(/Boojy keeps it but doesn't use it/);
  });

  it("the tick box is read-only here: a click changes nothing", () => {
    const { container: c, onUpdateText } = setup();
    const box = row(c, "favourite").querySelector("input") as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(onUpdateText).not.toHaveBeenCalled();
  });
});

describe("PropertiesBlock: folding", () => {
  it("folds to its header, unmounting the rows, and remembers it per note", () => {
    const { container: c } = setup();
    fireEvent.click(c.querySelector(".props-chev") as HTMLElement);
    expect(c.querySelectorAll(".props-row")).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(FOLDED_PROPERTIES_KEY) as string)).toEqual(["n1"]);
    cleanup();

    expect(setup(TEXT, "n1").container.querySelectorAll(".props-row")).toHaveLength(0);
    cleanup();
    expect(setup(TEXT, "n2").container.querySelectorAll(".props-row").length).toBeGreaterThan(0);
  });

  it("the word Properties folds it too, and opens it again", () => {
    const { container: c } = setup();
    const title = c.querySelector(".props-title") as HTMLElement;
    fireEvent.click(title);
    expect(title.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(title);
    expect(c.querySelectorAll(".props-row").length).toBeGreaterThan(0);
  });
});

describe("PropertiesBlock: the YAML", () => {
  it("</> shows the YAML as a field that commits what is typed", () => {
    const { container: c, getByRole, onUpdateText } = setup();
    fireEvent.click(getByRole("button", { name: "Edit as YAML" }));
    const field = c.querySelector(".props-yaml-field") as HTMLTextAreaElement;
    expect(field.value).toBe(TEXT);
    fireEvent.input(field, { target: { value: `${TEXT}\nmood: calm` } });
    expect(onUpdateText).toHaveBeenCalledWith("n1", 0, `${TEXT}\nmood: calm`);
    fireEvent.click(getByRole("button", { name: "Back to properties" }));
    expect(c.querySelector(".props-yaml-field")).toBeNull();
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
});
