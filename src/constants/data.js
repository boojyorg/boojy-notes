// @ts-check
/** @typedef {import("../types.d.ts").SlashCommand} SlashCommand */

// No demo content — new users start with an empty workspace
export const FOLDER_TREE = [];

export const SCALE_OPTIONS = [50, 67, 80, 90, 100, 110, 120, 133, 150, 170, 200];

/** @type {SlashCommand[]} */
export const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", desc: "#", icon: "H1", type: "h1" },
  { id: "h2", label: "Heading 2", desc: "##", icon: "H2", type: "h2" },
  { id: "h3", label: "Heading 3", desc: "###", icon: "H3", type: "h3" },
  { id: "bullet", label: "Bullet List", desc: "-", icon: "\u2022", type: "bullet" },
  { id: "numbered", label: "Numbered List", desc: "1.", icon: "1.", type: "numbered" },
  { id: "checkbox", label: "Checkbox", desc: "[]", icon: "\u2610", type: "checkbox" },
  { id: "divider", label: "Divider", desc: "---", icon: "\u2014", type: "spacer" },
  { id: "image", label: "Image", desc: "![]()", icon: "\u2B1A", type: "image" },
  { id: "code", label: "Code Block", desc: "```", icon: "</>", type: "code" },
  { id: "blockquote", label: "Blockquote", desc: ">", icon: "\u275D", type: "blockquote" },
  {
    id: "callout",
    label: "Callout",
    desc: "> [!]",
    icon: "!",
    type: "callout",
    calloutType: "note",
  },
  { id: "table", label: "Table", desc: "| | |", icon: "\u25A6", type: "table" },
  { id: "file", label: "File Attachment", desc: "", icon: "\u229F", type: "file" },
  { id: "embed", label: "Embed Note", desc: "![[]]", icon: "\u2293", type: "embed" },
];
