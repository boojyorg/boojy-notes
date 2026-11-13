import { describe, expect, it } from "vitest";
import type { Note, NoteData } from "../../src/types/notes";
import { linksFollow } from "../../src/utils/linkRewrite";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown";

/** A vault from `{ "Folder/Title": markdown }`, each note's id its path. */
function vault(files: Record<string, string>): NoteData {
  const data: NoteData = {};
  for (const [path, md] of Object.entries(files)) {
    const slash = path.lastIndexOf("/");
    const title = path.slice(slash + 1);
    data[path] = {
      id: path,
      title,
      folder: slash === -1 ? null : path.slice(0, slash),
      content: { title, blocks: markdownToBlocks(md) },
    } as Note;
  }
  return data;
}

const placed = (data: NoteData, id: string, change: Partial<Note>): NoteData => ({
  ...data,
  [id]: { ...data[id], ...change },
});

/** The Markdown of each note `linksFollow` changed, by id. */
function followed(before: NoteData, after: NoteData) {
  const result = linksFollow(before, after);
  const md: Record<string, string> = {};
  for (const [id, note] of Object.entries(result.notes)) {
    md[id] = blocksToMarkdown(note.content.blocks);
  }
  return { ...result, md };
}

describe("linksFollow: a rename", () => {
  it("rewrites every form of link to the note, and nothing else in the file", () => {
    const alpha = [
      "# About [[Beta]]",
      "",
      "See [[Beta]], [[Beta#Intro|the intro]], [[Beta#^ref]] and [[beta|lower]].",
      "",
      '- A [link](Beta.md) and [one more](Beta.md#Intro "titled").',
      "- [ ] A task for [[Beta]].",
      "",
      "![[Beta]]",
      "",
      "![[Beta#Intro]]",
      "",
      "> [!note] Read [[Beta]]",
      "> The body names [[Beta]] too.",
      "",
      "| Note     | Why        |",
      "| -------- | ---------- |",
      "| [[Beta]] | It is good |",
      "",
      "Not `[[Beta]]`, not $[[Beta]]$, not %%[[Beta]]%%, not \\[[Beta]], not [[Gamma]].",
      "",
      "```",
      "[[Beta]] and [x](Beta.md)",
      "```",
      "",
      "[^1]: A footnote about [[Beta]].",
      "",
    ].join("\n");
    const before = vault({ Alpha: alpha, Beta: "# Intro\n\nBody. ^ref\n", Gamma: "G.\n" });
    const after = placed(before, "Beta", { title: "Delta" });
    const { md, links, skipped } = followed(before, after);

    expect(Object.keys(md)).toEqual(["Alpha"]);
    expect(md.Alpha).toBe(
      alpha
        .replace("# About [[Beta]]", "# About [[Delta]]")
        .replace(
          "See [[Beta]], [[Beta#Intro|the intro]], [[Beta#^ref]] and [[beta|lower]].",
          "See [[Delta]], [[Delta#Intro|the intro]], [[Delta#^ref]] and [[Delta|lower]].",
        )
        .replace(
          '- A [link](Beta.md) and [one more](Beta.md#Intro "titled").',
          '- A [link](Delta.md) and [one more](Delta.md#Intro "titled").',
        )
        .replace("- [ ] A task for [[Beta]].", "- [ ] A task for [[Delta]].")
        .replace("![[Beta]]\n", "![[Delta]]\n")
        .replace("![[Beta#Intro]]", "![[Delta#Intro]]")
        .replace("> [!note] Read [[Beta]]", "> [!note] Read [[Delta]]")
        .replace("> The body names [[Beta]] too.", "> The body names [[Delta]] too.")
        // A lined-up table stays lined up: the column widens with its cell.
        .replace(
          "| Note     | Why        |\n| -------- | ---------- |\n| [[Beta]] | It is good |",
          "| Note      | Why        |\n| --------- | ---------- |\n| [[Delta]] | It is good |",
        )
        .replace("[^1]: A footnote about [[Beta]].", "[^1]: A footnote about [[Delta]]."),
    );
    expect(links).toBe(14);
    expect(skipped).toBe(0);
  });

  it("renamed back, puts the links back", () => {
    const alpha = "See [[Beta]], [[Beta#Intro|the intro]] and [b](Beta.md).\n";
    const before = vault({ Alpha: alpha, Beta: "B.\n" });
    const renamed = placed(before, "Beta", { title: "Delta" });
    const forth = linksFollow(before, renamed);
    const there = { ...renamed, ...forth.notes };
    const back = followed(there, placed(there, "Beta", { title: "Beta" }));
    expect(back.md.Alpha).toBe(alpha);
  });

  it("keeps a Markdown link's own style: escapes, raw spaces, brackets, a leading slash", () => {
    const alpha = [
      "[a](My%20Note.md) [b](My Note.md) [c](<My Note.md>) [d](/My%20Note.md#A%20Heading) [e](./My Note)",
      "",
    ].join("\n");
    const before = vault({ Alpha: alpha, "My Note": "N.\n" });
    const { md } = followed(before, placed(before, "My Note", { title: "Our (new) Plan" }));
    expect(md.Alpha).toBe(
      [
        "[a](Our%20%28new%29%20Plan.md) [b](Our %28new%29 Plan.md) [c](<Our (new) Plan.md>) [d](/Our%20%28new%29%20Plan.md#A%20Heading) [e](./Our %28new%29 Plan)",
        "",
      ].join("\n"),
    );
  });

  it("leaves a link that named no one note, a file, or the note it sits in", () => {
    const alpha =
      "[[Plan]] [[Missing]] [[paper.pdf]] [[#Top]] [t](#Top) [w](https://x.y/Beta.md)\n";
    const before = vault({ Alpha: alpha, "A/Plan": "1\n", "B/Plan": "2\n", Beta: "B.\n" });
    const after = placed(placed(before, "A/Plan", { title: "Scheme" }), "Beta", { title: "Delta" });
    expect(linksFollow(before, after)).toEqual({ notes: {}, links: 0, skipped: 0 });
  });
});

describe("linksFollow: a move and a folder's rename", () => {
  it("a path link follows the note to its new folder, by the shortest clear name", () => {
    const before = vault({
      Alpha: "[[Work/Gamma]] and [g](Work/Gamma.md)\n",
      "Work/Gamma": "G.\n",
    });
    const { md } = followed(before, placed(before, "Work/Gamma", { folder: "Job/2026" }));
    expect(md.Alpha).toBe("[[Gamma]] and [g](Job/2026/Gamma.md)\n");
  });

  it("a relative link inside the note that moved is rewritten only if it would miss", () => {
    const before = vault({
      "Work/Alpha": "[s](Sibling.md) [u](../Top.md) [[Sibling]]\n",
      "Work/Sibling": "S.\n",
      Top: "T.\n",
    });
    const { md, links } = followed(before, placed(before, "Work/Alpha", { folder: "Home/Deep" }));
    // `Sibling.md` is still the one note called that, as a click finds it;
    // `../Top.md` would now climb to `Home/Top`, which is no note.
    expect(md["Work/Alpha"]).toBe("[s](Sibling.md) [u](../../Top.md) [[Sibling]]\n");
    expect(links).toBe(1);

    // With a second Sibling in the vault the bare name finds neither, so the path is spelled.
    const two = vault({
      "Work/Alpha": "[s](Sibling.md)\n",
      "Work/Sibling": "S.\n",
      "Other/Sibling": "O.\n",
    });
    const moved = followed(two, placed(two, "Work/Alpha", { folder: "Home/Deep" }));
    expect(moved.md["Work/Alpha"]).toBe("[s](../../Work/Sibling.md)\n");
  });

  it("a folder's rename carries every link that spelled its path", () => {
    const before = vault({
      Index: "[[Uni/Sem 1/Notes]] and [n](Uni/Sem%201/Notes.md)\n",
      "Uni/Sem 1/Notes": "[e](Ethics.md)\n",
      "Uni/Sem 1/Ethics": "E.\n",
    });
    let after = before;
    for (const id of ["Uni/Sem 1/Notes", "Uni/Sem 1/Ethics"]) {
      after = placed(after, id, { folder: "Uni/Autumn" });
    }
    const { md } = followed(before, after);
    // The two that moved together still reach each other as written.
    expect(Object.keys(md)).toEqual(["Index"]);
    expect(md.Index).toBe("[[Notes]] and [n](Uni/Autumn/Notes.md)\n");
  });
});

describe("linksFollow: a namesake", () => {
  it("a name another note takes is spelled out for the links that meant the first", () => {
    const before = vault({
      Alpha: "[[Plan]] and [[Draft]]\n",
      "Work/Plan": "P.\n",
      "Home/Draft": "D.\n",
    });
    const { md } = followed(before, placed(before, "Home/Draft", { title: "Plan" }));
    expect(md.Alpha).toBe("[[Work/Plan]] and [[Home/Plan]]\n");
  });

  it("writes nothing it could not read back as that note", () => {
    // A root note cannot be told from a namesake in a folder by a wikilink.
    const before = vault({
      Alpha: "[[Draft]] and [d](Draft.md)\n",
      Draft: "D.\n",
      "Work/Plan": "P.\n",
    });
    const { md, links } = followed(before, placed(before, "Draft", { title: "Plan" }));
    expect(md.Alpha).toBe("[[Draft]] and [d](Plan.md)\n");
    expect(links).toBe(1);
  });
});

describe("linksFollow: what it does not read", () => {
  it("counts a note it cannot read, ignores a draft, and changes nothing when nothing moved", () => {
    const before = vault({
      Alpha: "[[Beta]]\n",
      Beta: "B.\n",
      Cloud: "",
      Bin: "",
      New: "[[Beta]]\n",
    });
    before.Cloud = { ...before.Cloud, offloaded: true };
    before.Bin = { ...before.Bin, unreadable: "encoding" };
    before.New = { ...before.New, _draft: true };
    expect(linksFollow(before, before)).toEqual({ notes: {}, links: 0, skipped: 2 });
    const { md, skipped } = followed(before, placed(before, "Beta", { title: "Delta" }));
    expect(Object.keys(md)).toEqual(["Alpha"]);
    expect(skipped).toBe(2);
  });

  it("hands back the same block objects where no link changed", () => {
    const before = vault({ Alpha: "Plain.\n\n[[Beta]]\n\nMore.\n", Beta: "B.\n" });
    const { notes } = linksFollow(before, placed(before, "Beta", { title: "Delta" }));
    const was = before.Alpha.content.blocks;
    const now = notes.Alpha.content.blocks;
    expect(now.map((b, i) => b === was[i])).toEqual(was.map((b) => b.text !== "[[Beta]]"));
  });
});
