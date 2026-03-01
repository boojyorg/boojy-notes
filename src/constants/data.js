// No demo content — new users start with an empty workspace
export const FOLDER_TREE = [];

export const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", desc: "Page-level heading", icon: "H1", type: "h1" },
  { id: "h2", label: "Heading 2", desc: "Large section heading", icon: "H2", type: "h2" },
  { id: "h3", label: "Heading 3", desc: "Small section heading", icon: "H3", type: "h3" },
  { id: "bullet", label: "Bullet List", desc: "Simple bulleted list", icon: "\u2022", type: "bullet" },
  { id: "numbered", label: "Numbered List", desc: "Ordered numbered list", icon: "1.", type: "numbered" },
  { id: "checkbox", label: "Checkbox", desc: "Task with a checkbox", icon: "\u2610", type: "checkbox" },
  { id: "text", label: "Text", desc: "Plain text paragraph", icon: "T", type: "p" },
  { id: "divider", label: "Divider", desc: "Visual spacer", icon: "\u2014", type: "spacer" },
  { id: "image", label: "Image", desc: "Insert an image", icon: "\uD83D\uDDBC", type: "image" },
];
