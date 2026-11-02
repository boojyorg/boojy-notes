import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import type { Block, NoteData } from "../types/notes";
import { readNoteIds, withNoteId, writeNoteIds } from "../utils/noteIdLists";
import { registerBlockOpener } from "../utils/blockOpen";
import { placeCaret } from "../utils/domHelpers";
import {
  addProperty,
  type Change,
  conversion,
  isNumber,
  nameProblem,
  type Property,
  type PropType,
  readProperties,
  removeProperty,
  renameProperty,
  setCheckbox,
  setList,
  setText,
  setTyped,
  setUntyped,
  shownDate,
} from "../utils/properties";
import { namesInOtherNotes, readPropertyTypes, rememberPropertyType } from "../utils/propertyTypes";
import { FoldChevronIcon, PlusIcon, PropertyTypeIcon, SourceViewIcon, TrashIcon } from "./Icons";
import Menu, { type MenuAnchor, type MenuItem, rectAnchor } from "./Menu";
import TickBox from "./TickBox";
import PropertyPicker from "./PropertyPicker";
import { Tooltip, useTooltip } from "./Tooltip";

/** The notes whose Properties section is folded on this device; open is the default. */
export const FOLDED_PROPERTIES_KEY = "boojy-folded-properties";

const TYPES: PropType[] = ["text", "list", "number", "checkbox", "date", "datetime"];
const TYPE_LABEL: Record<string, string> = {
  text: "Text",
  list: "List",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  datetime: "Date & time",
  tags: "Tags",
  aliases: "Aliases",
  untyped: "No type yet",
  nested: "Changed only as YAML",
};

/** What the icon says for the two names Boojy keeps without using: honest that it does nothing with them yet. */
const UNUSED_TIP: Record<string, string> = {
  aliases: "Other names for this note in Obsidian. Boojy doesn't use them in links or Search yet.",
  cssclasses: "Styles this note in Obsidian. Boojy keeps it but doesn't use it.",
};

/** A property's type for its icon and editor: what the value says, else what was chosen for it here. */
function typeOf(p: Property, chosen: Record<string, PropType>): PropType | null {
  // tags, aliases and cssclasses are lists by their name, unless written as one string.
  if (p.list || (p.fixed && p.shown === null)) return "list";
  return p.type ?? chosen[p.key] ?? null;
}

/** The icon a property shows: its type, the meaning its name fixes, or why the rows can't change it. */
export function iconFor(p: Property, chosen: Record<string, PropType> = {}): string {
  if (p.fixed === "tags" || p.fixed === "aliases") return p.fixed;
  if (!p.editable) return "nested";
  return typeOf(p, chosen) ?? "untyped";
}

/** Where in an element's text a press landed, in characters; null off its text. */
function pressOffset(e: ReactMouseEvent, el: HTMLElement): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | undefined;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const c = doc.caretPositionFromPoint(e.clientX, e.clientY);
    if (c) [node, offset] = [c.offsetNode, c.offset];
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (r) [node, offset] = [r.startContainer, r.startOffset];
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return null;
  let n = 0;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (t === node) return n + offset;
    n += (t as Text).data.length;
  }
  return null;
}

interface Editing {
  key: string;
  part: "value" | "name";
  draft: string;
  /** The value or name as it was when the edit began: a change from outside is told by it. */
  start: string;
  caret: number | null;
  error?: string;
}

interface MenuState {
  key: string;
  anchor: MenuAnchor;
  confirm?: { to: PropType; loss: string; change: Change };
}

interface PropertiesBlockProps {
  block: Block;
  noteId: string;
  blockIndex: number;
  syncGen: number;
  noteDataRef?: RefObject<NoteData>;
  onUpdateText: (noteId: string, blockIndex: number, text: string) => void;
  onEditFrontmatter?: (noteId: string, blockId: string, change: Change) => "ok" | "none" | "unsafe";
  /** Takes away a frontmatter block left with no text (a cancelled `/properties`). */
  onRemoveEmpty?: (noteId: string, blockId: string) => void;
  /** A tag pill's click: Search filtered by that tag, as a `#tag` in the text does. */
  onTagClick?: (tag: string) => void;
  accentColor?: string;
}

/**
 * A note's frontmatter as its properties: a quiet section at the top, one row
 * per property. Each part of a row has one job: the icon is its type (a menu
 * to change it, or Remove), the name renames, the value edits in place. Every
 * committed change is one undo entry that rewrites only that property's own
 * text, and is read back before it may stand (`runChange`). YAML the rows
 * can't read, or a change they can't make safely, opens the YAML itself.
 */
export default function PropertiesBlock(props: PropertiesBlockProps) {
  const { block, noteId, onEditFrontmatter } = props;
  const text = block.text ?? "";
  const read = readProperties(text);
  const [folded, setFolded] = useState(() => readNoteIds(FOLDED_PROPERTIES_KEY).includes(noteId));
  const [asYaml, setAsYaml] = useState(false);
  const [unsafe, setUnsafe] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [notice, setNotice] = useState<Editing | null>(null);
  // The type chosen for an empty value, which the file can't say yet:
  // remembered on this device by name (`propertyTypes`).
  const [chosen, setChosen] = useState<Record<string, PropType>>(readPropertyTypes);
  // Add property's picker; `fresh` when `/properties` made the section for it.
  // `from`: the block `/properties` was typed in, where a cancel puts the caret back.
  const [picker, setPicker] = useState<{
    anchor: MenuAnchor;
    fresh: boolean;
    from?: string;
  } | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  // YAML the rows can't read opens as YAML, and stays so once mended, so
  // mending it never swaps the field away under the caret.
  useEffect(() => {
    if (!read.ok) setAsYaml(true);
  }, [read.ok]);
  const yamlView = asYaml || !read.ok;

  // The property being edited changed outside Boojy: the edit ends and the
  // outside value shows, the draft kept for Restore. Never written over it.
  const propsNow = read.ok ? read.props : [];
  // A change the section made itself (a list's item added while it stays
  // open) is the new starting point, not news from outside.
  const ownChange = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the text is the signal
  useEffect(() => {
    const own = ownChange.current;
    ownChange.current = false;
    if (!editing) return;
    const p = propsNow.find((q) => q.key === editing.key);
    const now = p ? (editing.part === "name" ? p.key : JSON.stringify(p.shown)) : null;
    if (own) {
      if (now !== null && now !== editing.start) setEditing({ ...editing, start: now });
      return;
    }
    if (now !== editing.start) {
      setNotice(editing);
      setEditing(null);
    }
  }, [text]);

  const commit = useCallback(
    (change: Change) => {
      ownChange.current = true;
      const outcome = onEditFrontmatter?.(noteId, block.id, change) ?? "none";
      if (outcome !== "ok") ownChange.current = false;
      if (outcome === "unsafe") {
        setUnsafe(true);
        setAsYaml(true);
      }
      return outcome;
    },
    [onEditFrontmatter, noteId, block.id],
  );

  // `/properties` asks this block, perhaps before it is mounted, for its picker.
  useEffect(
    () =>
      registerBlockOpener(block.id, ({ what, from }) => {
        if (what !== "add" && what !== "add-new") return;
        setFolded((was) => {
          if (was)
            writeNoteIds(
              FOLDED_PROPERTIES_KEY,
              withNoteId(readNoteIds(FOLDED_PROPERTIES_KEY), noteId, false),
            );
          return false;
        });
        setAsYaml(false);
        requestAnimationFrame(() => {
          if (addRef.current)
            setPicker({ anchor: rectAnchor(addRef.current), fresh: what === "add-new", from });
        });
      }),
    [block.id, noteId],
  );

  const choosePicked = (name: string, type: PropType) => {
    setPicker(null);
    if (commit(addProperty(name, type)) !== "ok") return;
    setChosen(rememberPropertyType(name, type));
    if (type !== "checkbox") {
      setEditing({
        key: name,
        part: "value",
        draft: "",
        start: type === "list" ? "[]" : "null",
        caret: null,
      });
    }
  };
  const closePicker = () => {
    const fresh = picker?.fresh;
    const from = picker?.from;
    setPicker(null);
    if (fresh && !text.trim()) props.onRemoveEmpty?.(noteId, block.id);
    // Cancelled, the caret goes back to the line `/properties` was typed on,
    // so the next keys go where they were going (they were lost before).
    // At once, in the Escape's own keystroke: a frame later, keys typed in
    // that frame went nowhere.
    if (from) {
      const line = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(from)}"]`);
      if (line) placeCaret(line, 0, { reveal: false });
    }
  };

  const toggleFold = useCallback(() => {
    setFolded((was) => {
      writeNoteIds(
        FOLDED_PROPERTIES_KEY,
        withNoteId(readNoteIds(FOLDED_PROPERTIES_KEY), noteId, !was),
      );
      return !was;
    });
    setEditing(null);
    setMenu(null);
  }, [noteId]);

  const startEdit = (p: Property, part: "value" | "name", caret: number | null) => {
    const draft =
      part === "name"
        ? p.key
        : p.list || p.shown === null
          ? ""
          : typeOf(p, chosen) === "datetime"
            ? String(p.shown).slice(0, 16)
            : String(p.shown);
    setNotice(null);
    setEditing({
      key: p.key,
      part,
      draft,
      start: part === "name" ? p.key : JSON.stringify(p.shown),
      caret,
    });
  };

  /** The draft, committed as the change its type writes; false when it can't be (it says why). */
  const finish = (ed: Editing): boolean => {
    const p = propsNow.find((q) => q.key === ed.key);
    if (!p) return true;
    if (ed.part === "name") {
      if (ed.draft.trim() === p.key) {
        setEditing(null);
        return true;
      }
      const problem = nameProblem(text, p.key, ed.draft);
      if (problem) {
        setEditing({ ...ed, error: problem });
        return false;
      }
      setEditing(null);
      commit(renameProperty(p.key, ed.draft));
      return true;
    }
    const type = typeOf(p, chosen);
    const was =
      p.shown === null ? "" : String(p.shown).slice(0, type === "datetime" ? 16 : undefined);
    // An untouched field is no edit: compared as it stands, so a value with
    // spaces at its ends is never rewritten by opening it and leaving.
    if (ed.draft === was) {
      setEditing(null);
      return true;
    }
    // Text is kept as typed, spaces and all; the other types are trimmed.
    const v = type === "text" ? ed.draft : ed.draft.trim();
    if (v === was) {
      setEditing(null);
      return true;
    }
    if (type === "number" && v && !isNumber(v)) {
      setEditing({ ...ed, error: "Numbers only, like 4 or 7.5" });
      return false;
    }
    setEditing(null);
    if (type === "number" || type === "date" || type === "datetime")
      commit(setTyped(p.key, type, v));
    else if (type === "text") commit(setText(p.key, v));
    else commit(setUntyped(p.key, v));
    return true;
  };

  const openMenu = (p: Property, el: Element) => {
    setEditing(null);
    setMenu({ key: p.key, anchor: rectAnchor(el) });
  };

  const menuProp = menu ? propsNow.find((q) => q.key === menu.key) : undefined;
  const menuItems = (p: Property, state: MenuState): MenuItem[] => {
    const remove: MenuItem = {
      label: "Remove",
      icon: <TrashIcon />,
      danger: true,
      rule: true,
      action: () => {
        setMenu(null);
        commit(removeProperty(p.key));
      },
    };
    if (p.fixed === "tags" || p.fixed === "aliases") {
      return [
        {
          label: TYPE_LABEL[p.fixed],
          icon: <PropertyTypeIcon type={p.fixed} size={16} />,
          role: "menuitemradio",
          checked: true,
          disabled: true,
          detail: "Set by its name",
        },
        remove,
      ];
    }
    if (!p.editable) {
      return [
        {
          label: "Edit as YAML",
          icon: <SourceViewIcon size={16} />,
          action: () => {
            setMenu(null);
            setAsYaml(true);
          },
        },
        remove,
      ];
    }
    const current = typeOf(p, chosen);
    return [
      ...TYPES.map(
        (t): MenuItem => ({
          label: TYPE_LABEL[t],
          icon: <PropertyTypeIcon type={t} size={16} />,
          role: "menuitemradio",
          checked: current === t,
          action: () => {
            if (t === current) {
              setMenu(null);
              return;
            }
            const conv = conversion(p, t);
            if (conv.loss) {
              setMenu({ ...state, confirm: { to: t, loss: conv.loss, change: conv.change } });
              return;
            }
            setMenu(null);
            if (p.shown === null) setChosen(rememberPropertyType(p.key, t));
            commit(conv.change);
          },
        }),
      ),
      remove,
    ];
  };
  const confirmItems = (p: Property, confirm: NonNullable<MenuState["confirm"]>): MenuItem[] => [
    {
      label: `Keep as ${TYPE_LABEL[typeOf(p, chosen) ?? "untyped"]}`,
      action: () => setMenu(null),
    },
    {
      label: "Change",
      choice: true,
      action: () => {
        setMenu(null);
        commit(confirm.change);
      },
    },
  ];

  const toggleYaml = () => {
    if (!read.ok) return;
    setAsYaml((on) => !on);
    setUnsafe(false);
    setEditing(null);
  };

  return (
    <section
      className="props"
      data-properties=""
      data-folded={folded ? "" : undefined}
      data-yaml={yamlView ? "" : undefined}
      data-empty={read.ok && !propsNow.length ? "" : undefined}
      data-picking={picker ? "" : undefined}
      aria-label="Properties"
      // The section's fields own their input: it never reaches the editor's
      // own handlers, which would read it as typing in the note and take the
      // selection out of the field (only one Backspace was taken).
      onInput={(e) => e.stopPropagation()}
      onBeforeInput={(e) => e.stopPropagation()}
    >
      <div className="props-head">
        <button
          type="button"
          className="props-title"
          data-label="Properties"
          aria-label="Properties"
          aria-expanded={!folded}
          onClick={toggleFold}
        >
          <span className="props-chev" aria-hidden="true">
            <FoldChevronIcon />
          </span>
        </button>
      </div>
      {!folded &&
        (yamlView ? (
          <>
            <YamlField
              {...props}
              notice={
                !read.ok
                  ? "These properties can't be shown as rows, so they're shown as YAML."
                  : unsafe
                    ? "Boojy couldn't make that change safely. Edit it here as YAML."
                    : null
              }
            />
            {/* YAML the rows can't read has no rows to go back to. */}
            {read.ok && (
              <button
                type="button"
                className="props-action props-back"
                aria-label="Back to properties"
                onClick={toggleYaml}
              >
                <SourceViewIcon />
                <span data-label="Back to properties" />
              </button>
            )}
          </>
        ) : (
          <div className="props-rows">
            {propsNow.map((p) => (
              <PropertyRow
                key={p.key}
                property={p}
                type={typeOf(p, chosen)}
                icon={iconFor(p, chosen)}
                editing={editing?.key === p.key ? editing : null}
                notice={notice?.key === p.key ? notice : null}
                menuOpen={menu?.key === p.key}
                onEdit={(part, caret) => startEdit(p, part, caret)}
                onDraft={(draft) => setEditing((ed) => ed && { ...ed, draft, error: undefined })}
                onFinish={() => {
                  if (editing) finish(editing);
                }}
                onCancel={() => setEditing(null)}
                onMenu={(el) => openMenu(p, el)}
                onYaml={() => setAsYaml(true)}
                onRestore={() => {
                  if (!notice) return;
                  setNotice(null);
                  setEditing({
                    ...notice,
                    start: notice.part === "name" ? p.key : JSON.stringify(p.shown),
                    caret: null,
                  });
                }}
                onList={(items) => commit(setList(p.key, items))}
                onCheck={(on) => commit(setCheckbox(p.key, on))}
                onTagClick={props.onTagClick}
                accentColor={props.accentColor}
              />
            ))}
            {notice && !propsNow.some((q) => q.key === notice.key) && (
              // The row the draft was for is gone (renamed or removed outside):
              // the draft stays in reach here, never silently dropped.
              <p className="props-notice" data-lost="">
                {notice.part === "name"
                  ? `Your new name “${notice.draft}” wasn't saved: “${notice.key}” was renamed or removed outside Boojy.`
                  : `Your edit to “${notice.key}” wasn't saved: it was renamed or removed outside Boojy. It read “${notice.draft}”.`}{" "}
                <button
                  type="button"
                  className="props-restore"
                  onClick={() => {
                    navigator.clipboard?.writeText(notice.draft).catch(() => {});
                    setNotice(null);
                  }}
                >
                  Copy my edit
                </button>{" "}
                <button type="button" className="props-restore" onClick={() => setNotice(null)}>
                  Dismiss
                </button>
              </p>
            )}
            <button
              ref={addRef}
              type="button"
              className="props-add"
              aria-label="Add property"
              aria-expanded={!!picker}
              onClick={(e) => {
                if (picker) setPicker(null);
                else setPicker({ anchor: rectAnchor(e.currentTarget), fresh: false });
              }}
            >
              <PlusIcon />
              <span data-label="Add property" />
            </button>
            <button
              type="button"
              className="props-action props-to-yaml"
              aria-label="Edit as YAML"
              onClick={toggleYaml}
            >
              <SourceViewIcon />
              <span data-label="Edit as YAML" />
            </button>
          </div>
        ))}
      {picker && (
        <PropertyPicker
          anchor={picker.anchor}
          have={new Set(propsNow.map((q) => q.key.toLowerCase()))}
          names={namesInOtherNotes(props.noteDataRef?.current, noteId)}
          types={chosen}
          onChoose={choosePicked}
          onClose={closePicker}
        />
      )}
      {menu && menuProp && (
        <Menu
          key={menu.confirm ? "confirm" : "types"}
          label={menu.confirm ? `Change ${menuProp.key}` : `${menuProp.key} type`}
          idPrefix="property-menu-item"
          testId="property-menu"
          anchor={menu.anchor}
          gapY={4}
          minWidth={menu.confirm ? 240 : 180}
          maxWidth={280}
          initialActive={menu.confirm ? 0 : undefined}
          header={
            menu.confirm ? (
              <div className="props-confirm">
                <p className="props-confirm-title">
                  Change “{menuProp.key}” to {TYPE_LABEL[menu.confirm.to]}?
                </p>
                <p>{menu.confirm.loss}</p>
              </div>
            ) : undefined
          }
          items={menu.confirm ? confirmItems(menuProp, menu.confirm) : menuItems(menuProp, menu)}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}

interface RowProps {
  property: Property;
  type: PropType | null;
  icon: string;
  editing: Editing | null;
  notice: Editing | null;
  menuOpen: boolean;
  onEdit: (part: "value" | "name", caret: number | null) => void;
  onDraft: (draft: string) => void;
  onFinish: () => void;
  onCancel: () => void;
  onMenu: (el: Element) => void;
  onYaml: () => void;
  onRestore: () => void;
  onList: (items: string[]) => void;
  onCheck: (on: boolean) => void;
  onTagClick?: (tag: string) => void;
  accentColor?: string;
}

/** One property: its type icon (the menu), its name (rename) and its value (edit). */
function PropertyRow(r: RowProps) {
  const { property: p, editing } = r;
  const iconRef = useRef<HTMLButtonElement>(null);
  const caretAt = useRef<number | null>(null);
  const tip = useTooltip();
  const label = UNUSED_TIP[p.key] ?? TYPE_LABEL[r.icon] ?? "";
  const items = Array.isArray(p.shown) ? p.shown : [];

  const isTags = p.fixed === "tags";
  // A tag is the text's own pill, `#` and all, and opens Search as one does
  // (the list's click reads it); the file keeps the name bare.
  const pills = items.map((item, i) => (
    <span
      // biome-ignore lint/suspicious/noArrayIndexKey: a list may repeat an item
      key={i}
      className={isTags ? "props-pill props-tag" : "props-pill"}
      data-tag={isTags ? item : undefined}
    >
      {item}
      <button
        type="button"
        className="props-x"
        tabIndex={-1}
        aria-label={`Remove ${item}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          r.onList(items.filter((_, j) => j !== i));
        }}
      >
        ×
      </button>
    </span>
  ));

  let value: ReactNode;
  if (!p.editable) {
    value = (
      <button type="button" className="props-val props-muted" onClick={r.onYaml}>
        {String(p.shown ?? "")}
      </button>
    );
  } else if (r.type === "checkbox") {
    // The to-do's own tick box: one look and one feel wherever a box is ticked.
    const on = p.shown === true;
    value = (
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={p.key}
        className="checkbox-hit props-check"
        onClick={() => r.onCheck(!on)}
      >
        <TickBox checked={on} accentColor={r.accentColor} />
      </button>
    );
  } else if (r.type === "list") {
    value =
      editing?.part === "value" ? (
        <>
          {pills}
          <Field
            editing={editing}
            className="props-input props-list-input"
            placeholder={items.length ? "" : p.fixed === "tags" ? "Add a tag" : "Add an item"}
            onDraft={r.onDraft}
            onKey={(e) => {
              const v = editing.draft.trim();
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (v) {
                  r.onList([...items, v]);
                  r.onDraft("");
                } else if (e.key === "Enter") r.onCancel();
              } else if (e.key === "Backspace" && !editing.draft && items.length) {
                e.preventDefault();
                r.onList(items.slice(0, -1));
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                r.onCancel();
              }
            }}
            onBlur={() => {
              const v = editing.draft.trim();
              if (v) r.onList([...items, v]);
              r.onCancel();
            }}
          />
        </>
      ) : (
        <div
          className="props-val props-list"
          role="button"
          tabIndex={0}
          aria-label={`Edit ${p.key}`}
          onClick={(e) => {
            const tag = (e.target as HTMLElement).closest<HTMLElement>("[data-tag]");
            if (tag?.dataset.tag && r.onTagClick) r.onTagClick(tag.dataset.tag);
            else r.onEdit("value", null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              r.onEdit("value", null);
            }
          }}
        >
          {items.length ? pills : <span className="props-empty" />}
        </div>
      );
  } else if (editing?.part === "value") {
    value = (
      <Field
        editing={editing}
        className="props-input"
        type={r.type === "date" ? "date" : r.type === "datetime" ? "datetime-local" : "text"}
        inputMode={r.type === "number" ? "decimal" : undefined}
        placeholder="Empty"
        onDraft={r.type === "number" ? (v) => r.onDraft(numberTyping(v)) : r.onDraft}
        onKey={(e) => scalarKeys(e, editing, r)}
        onBlur={r.onFinish}
      />
    );
  } else {
    const shown = p.shown === null ? null : String(p.shown);
    const dated = r.type === "date" || r.type === "datetime";
    value = (
      <button
        type="button"
        className="props-val"
        aria-label={`Edit ${p.key}`}
        onMouseDown={(e) => {
          caretAt.current = pressOffset(e, e.currentTarget);
        }}
        onClick={() => {
          r.onEdit("value", dated ? null : caretAt.current);
          caretAt.current = null;
        }}
      >
        {shown === null ? (
          <span className="props-empty" />
        ) : dated ? (
          shownDate(shown)
        ) : r.type === "number" ? (
          shown
        ) : (
          shown
        )}
      </button>
    );
  }

  return (
    <div
      className="props-row"
      data-key={p.key}
      data-editing={editing ? "" : undefined}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("input")) return;
        e.preventDefault();
        if (iconRef.current) r.onMenu(iconRef.current);
      }}
      onKeyDown={(e) => {
        if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") {
          e.preventDefault();
          if (iconRef.current) r.onMenu(iconRef.current);
        }
      }}
    >
      <button
        ref={iconRef}
        type="button"
        className="props-icon"
        aria-label={`${p.key}: ${label}. Change type`}
        aria-haspopup="menu"
        aria-expanded={r.menuOpen}
        {...tip.handlers}
        onClick={(e) => r.onMenu(e.currentTarget)}
      >
        <PropertyTypeIcon type={r.icon} />
      </button>
      {tip.shown && !r.menuOpen && (
        <Tooltip label={label} anchor={iconRef.current} placement="below" />
      )}
      {editing?.part === "name" ? (
        <span className="props-name-edit">
          <Field
            editing={editing}
            className="props-input"
            onDraft={r.onDraft}
            onKey={(e) => scalarKeys(e, editing, r)}
            onBlur={r.onFinish}
          />
        </span>
      ) : (
        <button
          type="button"
          className="props-name"
          aria-label={`Rename ${p.key}`}
          onMouseDown={(e) => {
            caretAt.current = pressOffset(e, e.currentTarget);
          }}
          onClick={() => {
            r.onEdit("name", caretAt.current);
            caretAt.current = null;
          }}
        >
          {p.key}
        </button>
      )}
      <span className="props-value">
        {value}
        {editing?.error && <span className="props-error">{editing.error}</span>}
      </span>
      {r.notice && (
        <p className="props-notice">
          {r.notice.part === "name"
            ? `“${r.notice.start}” was renamed outside Boojy, so your edit wasn't saved.`
            : `${p.key} changed outside Boojy, so your edit wasn't saved.`}{" "}
          <button type="button" className="props-restore" onClick={r.onRestore}>
            Restore my edit
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * A number field takes only what a number is made of: digits, one point and
 * a leading minus. A letter typed or pasted is simply not taken.
 */
export function numberTyping(v: string): string {
  const sign = v.trimStart().startsWith("-") ? "-" : "";
  const [whole, ...rest] = v.replace(/[^\d.]/g, "").split(".");
  return sign + whole + (rest.length ? `.${rest.join("")}` : "");
}

/** Enter commits, Escape cancels, and ⌘Z cancels a changed draft before it undoes the note. */
function scalarKeys(e: ReactKeyboardEvent<HTMLInputElement>, ed: Editing, r: RowProps) {
  const original =
    ed.part === "name" ? ed.start : ed.start === "null" ? "" : String(JSON.parse(ed.start));
  if (e.key === "Enter") {
    e.preventDefault();
    r.onFinish();
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    r.onCancel();
  } else if (
    (e.metaKey || e.ctrlKey) &&
    !e.shiftKey &&
    e.key.toLowerCase() === "z" &&
    ed.draft !== original
  ) {
    e.preventDefault();
    e.stopPropagation();
    r.onCancel();
  }
}

/** An in-place field: focused on mount with the caret where the press landed, else at the end. */
function Field({
  editing,
  className,
  type = "text",
  inputMode,
  placeholder,
  onDraft,
  onKey,
  onBlur,
}: {
  editing: Editing;
  className: string;
  type?: string;
  inputMode?: "decimal";
  placeholder?: string;
  onDraft: (draft: string) => void;
  onKey: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the field opens
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (el.type === "text") {
      const at = editing.caret ?? el.value.length;
      el.setSelectionRange(at, at);
    }
  }, []);
  return (
    <input
      ref={ref}
      className={className}
      type={type}
      inputMode={inputMode}
      value={editing.draft}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      enterKeyHint="done"
      aria-label={editing.part === "name" ? `Rename ${editing.key}` : editing.key}
      aria-invalid={editing.error ? true : undefined}
      onChange={(e) => onDraft(e.target.value)}
      onKeyDown={onKey}
      onBlur={onBlur}
    />
  );
}

/**
 * The frontmatter as YAML, a real field: what it holds is the block's text,
 * committed on every input at the text grain, painted only when it does not
 * already hold the latest text (`useOwnedField`), as a code block's is.
 */
function YamlField({
  block,
  noteId,
  blockIndex,
  syncGen,
  noteDataRef,
  onUpdateText,
  notice,
}: PropertiesBlockProps & { notice: string | null }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fitHeight = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);
  useOwnedField(ref, {
    text: block.text ?? "",
    syncGen,
    latest: () => latestBlock(noteDataRef, noteId, block)?.text ?? "",
    read: (el: HTMLTextAreaElement) => el.value,
    paint: (el: HTMLTextAreaElement, text: string) => {
      const focused = document.activeElement === el;
      const at = focused ? Math.min(el.selectionStart, text.length) : 0;
      el.value = text;
      if (focused) el.selectionStart = el.selectionEnd = at;
      fitHeight();
    },
  });
  return (
    <div className="props-yaml">
      <textarea
        ref={ref}
        className="props-yaml-field"
        aria-label="Properties as YAML"
        spellCheck={false}
        rows={1}
        onInput={(e) => {
          onUpdateText(noteId, blockIndex, e.currentTarget.value);
          fitHeight();
        }}
      />
      {notice && <p className="props-note">{notice}</p>}
    </div>
  );
}
