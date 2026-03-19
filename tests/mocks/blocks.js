let counter = 0;

function id() {
  return `test-block-${++counter}`;
}

export function resetBlockCounter() {
  counter = 0;
}

export function paragraph(text = "") {
  return { id: id(), type: "p", text };
}

export function heading(level, text = "") {
  return { id: id(), type: `h${level}`, text };
}

export function bullet(text = "") {
  return { id: id(), type: "bullet", text };
}

export function numbered(text = "") {
  return { id: id(), type: "numbered", text };
}

export function checkbox(text = "", checked = false) {
  return { id: id(), type: "checkbox", text, checked };
}

export function codeBlock(text = "", lang = "") {
  return { id: id(), type: "code", text, lang };
}

export function spacer() {
  return { id: id(), type: "spacer", text: "" };
}

export function image(src = "test.png", alt = "") {
  return { id: id(), type: "image", src, alt, text: "", width: 100 };
}

export function table(rows) {
  return {
    id: id(),
    type: "table",
    text: "",
    rows: rows || [
      ["A", "B"],
      ["1", "2"],
    ],
  };
}

export function blockquote(text = "") {
  return { id: id(), type: "blockquote", text };
}

export function makeNoteData(noteId, blocks) {
  return {
    [noteId]: {
      id: noteId,
      title: "Test Note",
      content: { blocks },
    },
  };
}

export function makeNote(id, title = "Untitled", folder = null, blocks = null) {
  return {
    id,
    title,
    folder,
    path: folder ? [...folder.split("/"), title] : undefined,
    content: {
      title,
      blocks: blocks || [paragraph("")],
    },
    words: 0,
  };
}
