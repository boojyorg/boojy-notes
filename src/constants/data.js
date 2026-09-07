// @ts-check
/** @typedef {import("../types/notes").SlashCommand} SlashCommand */

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
 * it is deliberate: every block you could also have typed, roughly by how often
 * it is reached for (headings, lists, quote, code, divider), then the two that
 * only the menu can make, Table and Image, at the foot. That keeps the hint
 * column (below) filled from the top and then empty, rather than gapped.
 *
 * `hint` is the typed Markdown shortcut `useInputHandler.js` recognises at the
 * start of an empty block, shown muted at the right of the row: what you could
 * have typed instead of opening the menu, the way Notion's menu shows it. It is
 * NEVER the Markdown the block saves as (a table round-trips to `| | |`, an image
 * to `![]()`, a callout to `> [!]`, an embed to `![[]]`), because none of those
 * is something you type to make the block, and as a column they read as noise.
 * A block with no typed shortcut has an empty hint; that blank is the honest
 * message that the menu is its route. Don't invent a shortcut to fill it.
 *
 * `icon` names a Lucide glyph (mapped in Icons.jsx).
 */
/** @type {SlashCommand[]} */
export const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", hint: "#", icon: "heading-1", type: "h1" },
  { id: "h2", label: "Heading 2", hint: "##", icon: "heading-2", type: "h2" },
  { id: "h3", label: "Heading 3", hint: "###", icon: "heading-3", type: "h3" },
  { id: "bullet", label: "Bullet list", hint: "-", icon: "list", type: "bullet" },
  { id: "numbered", label: "Numbered list", hint: "1.", icon: "list-ordered", type: "numbered" },
  { id: "checkbox", label: "To-do list", hint: "[]", icon: "square-check", type: "checkbox" },
  { id: "blockquote", label: "Quote", hint: ">", icon: "text-quote", type: "blockquote" },
  { id: "code", label: "Code block", hint: "```", icon: "code", type: "code" },
  { id: "divider", label: "Divider", hint: "---", icon: "minus", type: "spacer" },
  { id: "table", label: "Table", hint: "", icon: "table", type: "table" },
  { id: "image", label: "Image", hint: "", icon: "image", type: "image" },
  // ── Tier 2: found by typing, never shown on the opening screen ──────────
  {
    id: "callout",
    label: "Callout",
    hint: "",
    icon: "info",
    type: "callout",
    calloutType: "note",
    advanced: true,
  },
  {
    id: "file",
    label: "File attachment",
    hint: "",
    icon: "paperclip",
    type: "file",
    advanced: true,
  },
  {
    id: "embed",
    label: "Embed note",
    hint: "",
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
