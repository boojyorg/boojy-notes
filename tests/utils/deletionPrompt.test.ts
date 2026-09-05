import { describe, expect, it } from "vitest";
import { deletionPrompt, trashedToast } from "../../src/utils/deletionPrompt";

describe("deletionPrompt — desktop (files move to the OS Trash)", () => {
  it("does not prompt for a single note", () => {
    expect(deletionPrompt("note", { count: 1, name: "Loose one", isWeb: false })).toBeNull();
  });

  it("asks before a folder, counting its notes and promising to leave other files alone", () => {
    const p = deletionPrompt("folder", { count: 1, name: "Work", isWeb: false });
    expect(p?.title).toBe("Move 1 note to the Trash?");
    expect(p?.message).toContain('"Work"');
    expect(p?.message).toContain("stays exactly where it is");
    // Folders are directories: the emptied one goes, one holding other files stays.
    expect(p?.message).toContain("removed only if nothing is left in it");
    expect(p?.message).not.toMatch(/delete/i);
    expect(p?.confirmLabel).toBe("Move to Trash");
    expect(p?.danger).toBe(false);

    expect(deletionPrompt("folder", { count: 12, name: "Work", isWeb: false })?.title).toBe(
      "Move 12 notes to the Trash?",
    );
  });

  it("does not prompt for a folder with no notes: no note is at stake", () => {
    expect(deletionPrompt("folder", { count: 0, name: "Empty", isWeb: false })).toBeNull();
  });

  it("asks before a bulk selection, counting the notes", () => {
    const p = deletionPrompt("bulk", { count: 2, isWeb: false });
    expect(p?.title).toBe("Move 2 notes to the Trash?");
    expect(p?.message).toContain("restored from the system Trash");
    expect(p?.confirmLabel).toBe("Move to Trash");
    expect(deletionPrompt("bulk", { count: 0, isWeb: false })).toBeNull();
  });

  it("names the trashed note in the toast", () => {
    expect(trashedToast("Loose one")).toBe('"Loose one" moved to the Trash');
    expect(trashedToast("")).toBe('"Untitled" moved to the Trash');
  });
});

describe("deletionPrompt — web (permanent)", () => {
  it("asks for every kind, in the danger colour, and says it is permanent", () => {
    for (const [kind, ctx] of [
      ["note", { count: 1, name: "A", isWeb: true }],
      ["folder", { count: 3, name: "Work", isWeb: true }],
      ["bulk", { count: 2, isWeb: true }],
    ] as const) {
      const p = deletionPrompt(kind, ctx);
      expect(p?.danger, kind).toBe(true);
      expect(p?.confirmLabel, kind).toBe("Delete");
      expect(p?.message, kind).toContain("permanently");
    }
    expect(deletionPrompt("note", { count: 1, name: "A", isWeb: true })?.title).toBe(
      "Delete note?",
    );
    expect(deletionPrompt("bulk", { count: 2, isWeb: true })?.title).toBe("Delete 2 notes?");
  });
});
