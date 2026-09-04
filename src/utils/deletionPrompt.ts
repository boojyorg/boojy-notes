/**
 * What to ask before a deletion, if anything. One place owns the wording so
 * every prompt says what actually happens rather than what sounds dramatic.
 *
 * Desktop moves a note's Markdown file to the OS Trash, where it can be
 * recovered; a single note therefore goes at once (with a quiet toast), and
 * only a folder or a bulk selection asks first. The folder on disk and any
 * file in it that is not a Boojy Notes note are never touched, and the prompt
 * says so. The web build has no Trash: deletion is permanent there, so every
 * kind asks, in the danger colour.
 */

export type DeletionKind = "note" | "folder" | "bulk";

export interface DeletionPrompt {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
}

export interface DeletionContext {
  /** How many notes the action removes. */
  count: number;
  /** The note's title, or the folder's name, for the wording. */
  name?: string;
  /** Web deletion is permanent; desktop deletion is a move to the Trash. */
  isWeb: boolean;
}

const notes = (n: number) => `${n} note${n === 1 ? "" : "s"}`;

export function deletionPrompt(kind: DeletionKind, ctx: DeletionContext): DeletionPrompt | null {
  const { count, isWeb } = ctx;
  const name = ctx.name || "Untitled";

  if (isWeb) {
    if (kind === "note")
      return {
        title: "Delete note?",
        message: `"${name}" will be permanently deleted. This can't be undone.`,
        confirmLabel: "Delete",
        danger: true,
      };
    if (kind === "folder")
      return {
        title: "Delete folder?",
        message: `"${name}" and all notes inside it will be permanently deleted. This can't be undone.`,
        confirmLabel: "Delete",
        danger: true,
      };
    if (count === 0) return null;
    return {
      title: `Delete ${notes(count)}?`,
      message: "These will be permanently deleted. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    };
  }

  // Desktop: a single note is recoverable from the Trash, so it needs no prompt.
  if (kind === "note") return null;

  if (kind === "folder") {
    // Nothing on disk changes for a folder with no notes; the row just goes.
    if (count === 0) return null;
    return {
      title: `Move ${notes(count)} to the Trash?`,
      message: `The ${count === 1 ? "note" : "notes"} in "${name}" will move to the system Trash. The folder on disk, and any file in it that is not a note, stay exactly as they are.`,
      confirmLabel: "Move to Trash",
      danger: false,
    };
  }

  if (count === 0) return null;
  return {
    title: `Move ${notes(count)} to the Trash?`,
    message: `${count === 1 ? "It" : "They"} can be restored from the system Trash. Nothing else is touched.`,
    confirmLabel: "Move to Trash",
    danger: false,
  };
}

/** The toast after a single desktop note has been sent to the Trash. */
export function trashedToast(name?: string): string {
  return `"${name || "Untitled"}" moved to the Trash`;
}
