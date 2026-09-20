/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#D43030" },
      modalShadow: "none",
    },
  }),
}));

import LinkPicker, { type LinkPickerProps } from "../../src/components/LinkPicker";

const notes = [
  { id: "g1", title: "Goals", folder: "Personal" },
  { id: "g2", title: "Goals", folder: "University/Semester 1" },
  { id: "plan", title: "Semester plan", folder: "University/Semester 1" },
  { id: "goog", title: "google.com", folder: "Reading" },
  { id: "todd", title: "Todd's Note", folder: null },
];
const anchor = { top: 10, bottom: 30, left: 100, right: 160 };

function mount(props: Partial<LinkPickerProps> = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const onRemove = vi.fn();
  const utils = render(
    <LinkPicker
      anchor={anchor}
      mode="create"
      notes={notes}
      onApply={onApply}
      onClose={onClose}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { ...utils, onApply, onClose, onRemove };
}
const rows = () =>
  screen.queryAllByRole("option").map((el) => el.textContent?.replace(/\s+/g, " ").trim());
const dest = () => screen.getByPlaceholderText(/search notes/i) as HTMLInputElement;
const type = (value: string) => fireEvent.change(dest(), { target: { value } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LinkPicker, creating", () => {
  it("is one field, focused, listing notes with their folders; an address is the first row, Create the last", () => {
    mount();
    expect(document.activeElement).toBe(dest());
    expect(rows()).toEqual([
      "GoalsPersonal",
      "GoalsUniversity/Semester 1",
      "Semester planUniversity/Semester 1",
      "google.comReading",
      "Todd's NoteNotes",
    ]);
    type("google.com");
    expect(rows()).toEqual(["Link to google.com", "google.comReading"]);
    type("github.com/boojy");
    expect(rows()).toEqual(["Link to github.com/boojy", "Create note “github.com/boojy”"]);
    type("goals");
    // A note of that name exists: no Create row.
    expect(rows()).toEqual(["GoalsPersonal", "GoalsUniversity/Semester 1"]);
  });

  it("Enter applies the highlighted row, the arrows move it, a click applies its row", () => {
    const { onApply } = mount();
    type("goals");
    fireEvent.keyDown(dest(), { key: "ArrowDown" });
    fireEvent.keyDown(dest(), { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith({
      dest: { kind: "note", id: "g2", title: "Goals" },
      text: null,
    });
    type("github.com");
    fireEvent.click(screen.getByTestId("link-row-url"));
    expect(onApply).toHaveBeenLastCalledWith({
      dest: { kind: "url", url: "https://github.com" },
      text: null,
    });
    fireEvent.click(screen.getByTestId("link-row-create"));
    expect(onApply).toHaveBeenLastCalledWith({
      dest: { kind: "note", id: null, title: "github.com", create: true },
      text: null,
    });
  });

  it("the [[ route is notes only: no address row, and the query it opened with", () => {
    mount({ notesOnly: true, initialDest: "goo" });
    expect(dest().value).toBe("goo");
    expect(rows()).toEqual(["google.comReading", "Create note “goo”"]);
  });

  it("Enter on a name no note has creates it; Escape closes", () => {
    const { onApply, onClose } = mount();
    type("zzz");
    fireEvent.keyDown(dest(), { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith({
      dest: { kind: "note", id: null, title: "zzz", create: true },
      text: null,
    });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("LinkPicker, editing", () => {
  const edit = (extra: Partial<LinkPickerProps> = {}) =>
    mount({ mode: "edit", initialText: "Todd's Note", initialDest: "[[Todd's Note]]", ...extra });

  it("shows Text and Destination, Text focused and selected, and no list until the destination changes", () => {
    edit();
    const text = screen.getByLabelText("Text") as HTMLInputElement;
    expect(document.activeElement).toBe(text);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "goals" } });
    expect(rows()).toEqual(["GoalsPersonal", "GoalsUniversity/Semester 1"]);
  });

  it("Enter with only the text changed keeps the destination; Tab moves between fields and commits nothing", () => {
    const { onApply } = edit();
    const text = screen.getByLabelText("Text") as HTMLInputElement;
    fireEvent.change(text, { target: { value: "Todd" } });
    fireEvent.keyDown(text, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Destination"));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("Destination"), { key: "Enter" });
    expect(onApply).toHaveBeenCalledWith({
      dest: { kind: "note", id: "todd", title: "Todd's Note", keep: true },
      text: "Todd",
    });
  });

  it("an invalid destination is refused on Enter, and a press outside then closes without applying", async () => {
    const { onApply, onClose } = edit();
    const d = screen.getByLabelText("Destination") as HTMLInputElement;
    fireEvent.change(d, { target: { value: "" } });
    fireEvent.keyDown(d, { key: "Enter" });
    expect(onApply).not.toHaveBeenCalled();
    expect(d.getAttribute("aria-invalid")).toBe("true");
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("a press outside commits a valid change", async () => {
    const { onApply } = edit();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Todd" } });
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ text: "Todd" }));
  });

  it("a link that names two notes lists both at once; Remove link asks to remove", () => {
    const { onRemove } = edit({
      initialText: "Goals",
      initialDest: "[[Goals]]",
      searchAtOpen: true,
      candidateIds: ["g1", "g2"],
    });
    expect(rows()).toEqual(["GoalsPersonal", "GoalsUniversity/Semester 1"]);
    fireEvent.mouseDown(screen.getByText("Remove link"));
    expect(onRemove).toHaveBeenCalled();
  });
});
