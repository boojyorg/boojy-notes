// @ts-check
/** @typedef {import("../types.d.ts").SlashCommand} SlashCommand */

// No demo content — new users start with an empty workspace
export const FOLDER_TREE = [];

/** @type {SlashCommand[]} */
export const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", desc: "#", icon: "H1", type: "h1" },
  { id: "h2", label: "Heading 2", desc: "##", icon: "H2", type: "h2" },
  { id: "h3", label: "Heading 3", desc: "###", icon: "H3", type: "h3" },
  { id: "bullet", label: "Bullet List", desc: "-", icon: "\u2022", type: "bullet" },
  { id: "numbered", label: "Numbered List", desc: "1.", icon: "1.", type: "numbered" },
  { id: "checkbox", label: "Checkbox", desc: "[]", icon: "\u2610", type: "checkbox" },
  { id: "divider", label: "Divider", desc: "---", icon: "\u2014", type: "spacer" },
  { id: "image", label: "Image", desc: "![]()", icon: "\uD83D\uDDBC", type: "image" },
  { id: "code", label: "Code Block", desc: "```", icon: "</>", type: "code" },
  {
    id: "callout",
    label: "Callout",
    desc: ">",
    icon: "!",
    type: "callout",
    calloutType: "note",
  },
  { id: "table", label: "Table", desc: "", icon: "\u25A6", type: "table" },
  { id: "file", label: "File Attachment", desc: "", icon: "\uD83D\uDCCE", type: "file" },
  { id: "embed", label: "Embed Note", desc: "![[]]", icon: "\u2293", type: "embed" },
];
