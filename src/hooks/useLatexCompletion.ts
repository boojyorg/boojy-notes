import { type RefObject, useCallback, useRef, useState } from "react";
import { useMenuKeys } from "./useMenuKeys";
import { useNoteDataActions } from "../context/NoteDataContext";
import { type LatexCommand, commandAtCaret, matchCommands } from "../utils/latexCommands";

interface Offer {
  from: number;
  query: string;
  rows: LatexCommand[];
}

export interface LatexCompletion {
  offer: Offer | null;
  active: number;
  setActive: (i: number) => void;
  choose: (i: number) => void;
  /** Read the field again: after an input, a click or a caret move. */
  refresh: () => void;
  /** The menu's turn at a key, before the field's own; true when it took it. */
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

/**
 * The `\` menu's state for a formula's source field. It offers commands only
 * while the caret ends a `\word` (never mid-word, never after `\\`), and owns
 * a key only while it is offering (`useMenuKeys`, `suggestion`). Choosing
 * replaces the `\word` with the command, the caret inside its first `{}`, and
 * commits through `apply` (the field's own commit) as one undo entry of its
 * own: the typing group is closed on both sides, so Cmd+Z gives back `\fr`.
 * Escape closes the menu for that word; Shift+Enter is never the menu's.
 */
export function useLatexCompletion(
  fieldRef: RefObject<HTMLTextAreaElement | null>,
  apply: () => void,
): LatexCompletion {
  // The context is JavaScript; its actions are typed here, where they are used.
  const { closeTypingGroup } = useNoteDataActions() as { closeTypingGroup: () => void };
  const [offer, setOffer] = useState<Offer | null>(null);
  const [active, setActive] = useState(0);
  // The word Escape (or a choice) closed the menu on, so it stays closed until
  // the word changes. A ref: the select event that follows a choice reads it
  // before any render could.
  const dismissed = useRef<number | null>(null);

  const refresh = useCallback(() => {
    const ta = fieldRef.current;
    const at = ta ? commandAtCaret(ta.value, ta.selectionStart, ta.selectionEnd) : null;
    if (!at || at.from === dismissed.current) {
      if (!at) dismissed.current = null;
      setOffer(null);
      return;
    }
    const rows = matchCommands(at.query);
    setOffer(rows.length ? { ...at, rows } : null);
    setActive(0);
  }, [fieldRef]);

  const choose = useCallback(
    (i: number) => {
      const ta = fieldRef.current;
      const row = offer?.rows[i];
      if (!ta || !offer || !row) return;
      const end = ta.selectionEnd;
      closeTypingGroup();
      ta.value = ta.value.slice(0, offer.from) + row.insert + ta.value.slice(end);
      const caret = offer.from + row.caret;
      ta.setSelectionRange(caret, caret);
      apply();
      closeTypingGroup();
      // `\alpha` just inserted ends a word too; it is not offered again.
      dismissed.current = offer.from;
      setOffer(null);
    },
    [fieldRef, offer, apply, closeTypingGroup],
  );

  const close = useCallback(() => {
    if (offer) dismissed.current = offer.from;
    setOffer(null);
  }, [offer]);

  const keys = useMenuKeys({
    rows: () => (offer?.rows ?? []).map((r) => ({ label: r.command })),
    active,
    setActive,
    choose,
    close,
    suggestion: true,
  });

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!offer) return false;
      // Shift+Enter finishes the formula, never chooses.
      if (e.key === "Enter" && e.shiftKey) {
        setOffer(null);
        return false;
      }
      const took = e.key === "Tab" && !e.shiftKey ? (choose(active), true) : keys(e.nativeEvent);
      if (took) e.preventDefault();
      return took;
    },
    [offer, active, choose, keys],
  );

  return { offer, active, setActive, choose, refresh, onKeyDown };
}
