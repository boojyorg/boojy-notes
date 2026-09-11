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
 * it is deliberate: the Markdown blocks roughly by how often they are reached
 * for (headings, lists, quote, code, divider), then Table and Image, whose
 * triggers are Boojy's own rather than Markdown, at the foot.
 *
 * `hint` is the typed shortcut `useInputHandler.js` recognises at the start of an
 * empty block, shown muted at the right of the row: what you could have typed
 * instead of opening the menu, the way Notion's menu shows it. Nine are plain
 * Markdown. Two are this app's own quick keys, in the menu's three-of-a-symbol
 * grammar (`---`, three backticks, `|||`) and the box rhyme (`[]` a task, `![]`
 * a picture); they run the same command as the row. A hint is NEVER the Markdown
 * the block saves as (`| | |`, `![]()`, `> [!]`, `![[]]`): none of those is what
 * you type to make the block, and as a column they read as noise. Search-only
 * headings have typed triggers too; other tier-2 blocks have empty hints.
 *
 * `icon` names a Lucide glyph (mapped in Icons.jsx).
 */
/** @type {SlashCommand[]} */
export const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", hint: "#", icon: "heading-1", type: "h1" },
  { id: "h2", label: "Heading 2", hint: "##", icon: "heading-2", type: "h2" },
  { id: "h3", label: "Heading 3", hint: "###", icon: "heading-3", type: "h3" },
  { id: "h4", label: "Heading 4", hint: "####", icon: "heading-4", type: "h4", advanced: true },
  { id: "h5", label: "Heading 5", hint: "#####", icon: "heading-5", type: "h5", advanced: true },
  { id: "h6", label: "Heading 6", hint: "######", icon: "heading-6", type: "h6", advanced: true },
  { id: "bullet", label: "Bullet list", hint: "-", icon: "list", type: "bullet" },
  { id: "numbered", label: "Numbered list", hint: "1.", icon: "list-ordered", type: "numbered" },
  { id: "checkbox", label: "To-do list", hint: "[]", icon: "square-check", type: "checkbox" },
  { id: "blockquote", label: "Quote", hint: ">", icon: "text-quote", type: "blockquote" },
  { id: "code", label: "Code block", hint: "```", icon: "code", type: "code" },
  { id: "divider", label: "Divider", hint: "---", icon: "minus", type: "spacer" },
  { id: "table", label: "Table", hint: "|||", icon: "table", type: "table" },
  { id: "image", label: "Image", hint: "![]", icon: "image", type: "image" },
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
  return pool.filter(
    (c) => c.label.toLowerCase().includes(q) || (/^h[1-6]$/.test(c.id) && c.id === q),
  );
}
