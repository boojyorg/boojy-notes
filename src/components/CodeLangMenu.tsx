import Menu, { type MenuAnchor } from "./Menu";

/**
 * A code block's language menu, opened from the label at its bottom-right
 * corner.
 *
 * It is the Sort menu's grammar: `menuitemradio` rows in the shared menu, the
 * chosen one ticked. Two things are its own. The
 * labels are flush, with no glyph column: Lucide ships no language marks, and
 * a second icon set of brand logos beside a line set is what makes a UI read
 * as assembled (`Icons.jsx`). And **a letter jumps to a language**, because
 * nine rows is where reading the list beats scanning it; the menu takes focus
 * (`useFocusTrap`) so the letters never reach the code field under it.
 *
 * The list is Plain, then alphabetical: one editorial exception, because Plain
 * is the absence of a language, and a mechanical rule for every language added
 * after it.
 */

export interface CodeLangItem {
  value: string;
  label: string;
}

interface CodeLangMenuProps {
  /** Anchor rect of the language label (viewport coordinates). */
  anchor: MenuAnchor;
  languages: CodeLangItem[];
  /** The block's current language value. */
  lang: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export { typeAheadIndex } from "../utils/menuKeys";

export default function CodeLangMenu({
  anchor,
  languages,
  lang,
  onSelect,
  onClose,
}: CodeLangMenuProps) {
  // The label sits at the block's right edge, so the menu's right edge meets it.
  return (
    <Menu
      label="Code language"
      idPrefix="code-lang-item"
      testId="code-lang-menu"
      checkTestId="code-lang-check"
      anchor={anchor}
      gapY={4}
      align="end"
      minWidth={200}
      onClose={onClose}
      items={languages.map((item) => ({
        label: item.label,
        role: "menuitemradio",
        checked: item.value === lang,
        action: () => {
          onSelect(item.value);
          onClose();
        },
      }))}
    />
  );
}
