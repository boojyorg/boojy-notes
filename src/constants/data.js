// @ts-check
/** @typedef {import("../types/notes").SlashCommand} SlashCommand */

// No demo content — new users start with an empty workspace
export const FOLDER_TREE = [];

export const SCALE_OPTIONS = [50, 67, 80, 90, 100, 110, 120, 133, 150, 170, 200];

/**
 * Blocks offered by the `/` menu.
 *
 * TIERS. The menu opens showing only the untiered commands — the eleven blocks
 * most people reach for next. `advanced: true` keeps a command out of that first
 * screen but fully reachable: as soon as anything is typed after the slash, the
 * search runs over everything. So `/call` finds Callout without Callout having to
 * sit in front of every new user forever. Nothing is removed by tiering.
 *
 * ORDER is the only structure this menu has (no group labels at eleven rows), so
 * it is deliberate: headings, then lists, then Table and Image — the two with no
 * typed-markdown shortcut in `useInputHandler.js`, which makes the menu their only
 * comfortable route — then code and quote, with Divider last because `---` is
 * quicker to type than the menu is to open.
 *
 * `icon` names a Lucide glyph (mapped in Icons.jsx); `desc` records the markdown
 * the block round-trips to. The menu no longer renders `desc` — it stayed a busy
 * second column — but it documents the syntax next to the command it belongs to.
 */
/** @type {SlashCommand[]} */
export const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", desc: "#", icon: "heading-1", type: "h1" },
  { id: "h2", label: "Heading 2", desc: "##", icon: "heading-2", type: "h2" },
  { id: "h3", label: "Heading 3", desc: "###", icon: "heading-3", type: "h3" },
  { id: "bullet", label: "Bullet list", desc: "-", icon: "list", type: "bullet" },
  { id: "numbered", label: "Numbered list", desc: "1.", icon: "list-ordered", type: "numbered" },
  { id: "checkbox", label: "Checkbox", desc: "[]", icon: "square-check", type: "checkbox" },
  { id: "table", label: "Table", desc: "| | |", icon: "table", type: "table" },
  { id: "image", label: "Image", desc: "![]()", icon: "image", type: "image" },
  { id: "code", label: "Code block", desc: "```", icon: "code", type: "code" },
  { id: "blockquote", label: "Blockquote", desc: ">", icon: "text-quote", type: "blockquote" },
  { id: "divider", label: "Divider", desc: "---", icon: "minus", type: "spacer" },
  // ── Tier 2: found by typing, never shown on the opening screen ──────────
  {
    id: "callout",
    label: "Callout",
    desc: "> [!]",
    icon: "info",
    type: "callout",
    calloutType: "note",
    advanced: true,
  },
  {
    id: "file",
    label: "File attachment",
    desc: "",
    icon: "paperclip",
    type: "file",
    advanced: true,
  },
  {
    id: "embed",
    label: "Embed note",
    desc: "![[]]",
    icon: "link",
    type: "embed",
    advanced: true,
  },
];

/**
 * The commands to show for a given `/` query — the one place the tier rule lives.
 * Both the menu and its keyboard navigation call this, so the list you arrow
 * through is always the list you can see.
 *
 * @param {string} query text typed after the slash
 * @returns {SlashCommand[]}
 */
export function filterSlashCommands(query) {
  const q = (query || "").toLowerCase();
  // Empty query = the opening screen: tier 1 only. Any query searches everything.
  const pool = q ? SLASH_COMMANDS : SLASH_COMMANDS.filter((c) => !c.advanced);
  return pool.filter((c) => c.label.toLowerCase().includes(q));
}
