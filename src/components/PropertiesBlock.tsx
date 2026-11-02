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
import { measureBlockPlaces, settleBlocks } from "../utils/blockSettle";
import { placeCaret } from "../utils/domHelpers";
import {
  addProperty,
  type Change,
  conversion,
  isNumber,
  nameProblem,
  type Property,
  type PropType,
  insertItem,
  readProperties,
  removeItem,
  removeProperty,
  renameProperty,
  replaceItem,
  setCheckbox,
  setText,
  setTyped,
  setUntyped,
  shownDate,
} from "../utils/properties";
import { namesInOtherNotes, readPropertyTypes, rememberPropertyType } from "../utils/propertyTypes";
import { TAG_BODY } from "../utils/tags";
import {
  FoldChevronIcon,
  PencilIcon,
  PlusIcon,
  PropertyTypeIcon,
  RemoveItemIcon,
  SearchIcon,
  SourceViewIcon,
  TrashIcon,
} from "./Icons";
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
  /** A list: the item being edited, or (absent) a new one going in at `at`. */
  item?: number;
  at?: number;
  /** A list's empty new-item field: Backspace has picked the item before it; again removes it. */
  armed?: boolean;
}

/** A tag as the grammar reads one (`TAG_RE` without its `#`). */
const TAG_NAME_RE = new RegExp(`^${TAG_BODY}$`, "u");
const listOf = (p: Property) => (Array.isArray(p.shown) ? p.shown : []);

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
  // Unfolded by hand this visit: what opens fades in (a note opening never animates).
  const [arrived, setArrived] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const [unsafe, setUnsafe] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [notice, setNotice] = useState<Editing | null>(null);
  // A list item's own menu: Edit, Search for a tag, Remove.
  const [itemMenu, setItemMenu] = useState<{ key: string; i: number; anchor: MenuAnchor } | null>(
    null,
  );
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

  // The rows come and go at once (a hidden field must never keep focus); only
  // the blocks below glide to their new place, as a dropped block's do.
  const toggleFold = useCallback(() => {
    const section = sectionRef.current;
    const editor = section?.closest("[data-block-id]")?.parentElement ?? null;
    const places = measureBlockPlaces(editor);
    if (section?.contains(document.activeElement) && document.activeElement !== titleRef.current)
      titleRef.current?.focus({ preventScroll: true });
    writeNoteIds(
      FOLDED_PROPERTIES_KEY,
      withNoteId(readNoteIds(FOLDED_PROPERTIES_KEY), noteId, !folded),
    );
    setFolded(!folded);
    setArrived(folded);
    setEditing(null);
    setMenu(null);
    settleBlocks(editor, places);
  }, [noteId, folded]);

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

  // A list is edited an item at a time, each change splicing only that item.
  const editItem = (p: Property, i: number, caret: number | null) => {
    setNotice(null);
    setItemMenu(null);
    setEditing({
      key: p.key,
      part: "value",
      item: i,
      draft: listOf(p)[i] ?? "",
      start: JSON.stringify(p.shown),
      caret,
    });
  };
  const addAt = (p: Property, at: number) => {
    setNotice(null);
    setItemMenu(null);
    setEditing({
      key: p.key,
      part: "value",
      at,
      draft: "",
      start: JSON.stringify(p.shown),
      caret: null,
    });
  };
  /** A list change; when it can't be made the edit ends (unsafe opens the YAML). */
  const listCommit = (change: Change) => {
    const ok = commit(change) === "ok";
    if (!ok) setEditing(null);
    return ok;
  };
  /**
   * The draft of a list's field, saved: an item's new text (emptied, it goes),
   * or a new item. `next` then opens a new item after it, as Enter does in a
   * list in the note; else the edit ends.
   */
  const saveListEdit = (ed: Editing, next: boolean) => {
    const p = propsNow.find((q) => q.key === ed.key);
    if (!p) return setEditing(null);
    const items = listOf(p);
    const v = ed.draft.trim();
    if (v && p.fixed === "tags" && !TAG_NAME_RE.test(v)) {
      setEditing({ ...ed, error: "A tag starts with a letter: letters, numbers, - _ and /" });
      return;
    }
    if (ed.item !== undefined) {
      const was = items[ed.item];
      if (was === undefined) return setEditing(null);
      if (!v) {
        setEditing(null);
        listCommit(removeItem(p.key, ed.item, was));
        return;
      }
      if (v !== was && !listCommit(replaceItem(p.key, ed.item, was, v))) return;
      if (next) addAt(p, ed.item + 1);
      else setEditing(null);
      return;
    }
    const at = Math.min(ed.at ?? items.length, items.length);
    if (!v) return setEditing(null);
    if (!listCommit(insertItem(p.key, at, v))) return;
    if (next) setEditing({ ...ed, at: at + 1, draft: "", armed: false, error: undefined });
    else setEditing(null);
  };
  const removeAt = (p: Property, i: number) => {
    const was = listOf(p)[i];
    if (was === undefined) return;
    setItemMenu(null);
    // A new-item field after it keeps its place among what is left.
    if (editing?.key === p.key && editing.item === undefined && (editing.at ?? 0) > i)
      setEditing({ ...editing, at: (editing.at ?? 0) - 1, armed: false });
    else if (editing?.key === p.key && editing.item !== undefined) setEditing(null);
    commit(removeItem(p.key, i, was));
  };
  /** Backspace in an empty new-item field: the first picks the item before it, the second removes it. */
  const backspaceList = (ed: Editing) => {
    const p = propsNow.find((q) => q.key === ed.key);
    const at = ed.at ?? 0;
    if (!p || at === 0) return;
    if (!ed.armed) {
      setEditing({ ...ed, armed: true });
      return;
    }
    const was = listOf(p)[at - 1];
    if (was === undefined) return;
    setEditing({ ...ed, at: at - 1, armed: false });
    commit(removeItem(p.key, at - 1, was));
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
  const itemMenuProp = itemMenu ? propsNow.find((q) => q.key === itemMenu.key) : undefined;
  const itemMenuItems = (p: Property, i: number): MenuItem[] => {
    const item = listOf(p)[i];
    return [
      { label: "Edit", icon: <PencilIcon />, action: () => editItem(p, i, null) },
      ...(p.fixed === "tags" && props.onTagClick
        ? [
            {
              label: `Search for #${item}`,
              icon: <SearchIcon />,
              action: () => {
                setItemMenu(null);
                props.onTagClick?.(item);
              },
            },
          ]
        : []),
      {
        label: "Remove",
        icon: <TrashIcon />,
        danger: true,
        rule: true,
        action: () => removeAt(p, i),
      },
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

  // YAML opens from a value the rows can't show (or its icon's menu); this is the way back.
  const backToRows = () => {
    setAsYaml(false);
    setUnsafe(false);
    setEditing(null);
  };

  return (
    <section
      ref={sectionRef}
      className="props"
      data-arrived={arrived ? "" : undefined}
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
          ref={titleRef}
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
                onClick={backToRows}
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
                onDraft={(draft) =>
                  setEditing((ed) => ed && { ...ed, draft, error: undefined, armed: false })
                }
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
                onEditItem={(i, caret) => editItem(p, i, caret)}
                onAddAt={(at) => addAt(p, at)}
                onSaveList={(next) => {
                  if (editing) saveListEdit(editing, next);
                }}
                onBackspaceList={() => {
                  if (editing) backspaceList(editing);
                }}
                onRemoveItem={(i) => removeAt(p, i)}
                onItemMenu={(i, el) => {
                  setEditing(null);
                  setMenu(null);
                  setItemMenu({ key: p.key, i, anchor: rectAnchor(el) });
                }}
                onCheck={(on) => commit(setCheckbox(p.key, on))}
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
      {itemMenu && itemMenuProp && listOf(itemMenuProp)[itemMenu.i] !== undefined && (
        <Menu
          label={`${itemMenuProp.key}: ${listOf(itemMenuProp)[itemMenu.i]}`}
          idPrefix="property-item-menu-item"
          testId="property-item-menu"
          anchor={itemMenu.anchor}
          gapY={4}
          minWidth={180}
          maxWidth={280}
          items={itemMenuItems(itemMenuProp, itemMenu.i)}
          onClose={() => setItemMenu(null)}
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
  onEditItem: (i: number, caret: number | null) => void;
  onAddAt: (at: number) => void;
  onSaveList: (next: boolean) => void;
  onBackspaceList: () => void;
  onRemoveItem: (i: number) => void;
  onItemMenu: (i: number, el: Element) => void;
  onCheck: (on: boolean) => void;
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
  const listEdit = r.type === "list" && editing?.part === "value" ? editing : null;
  const newAt =
    listEdit && listEdit.item === undefined
      ? Math.min(listEdit.at ?? items.length, items.length)
      : -1;
  // Enter or Escape has settled the field: the blur its unmounting may bring saves nothing twice.
  const settled = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new field is a fresh start
  useEffect(() => {
    settled.current = false;
  }, [listEdit?.item, newAt]);
  const listField = listEdit && (
    <Field
      key="list-field"
      editing={listEdit}
      className="props-input props-list-input"
      placeholder={
        listEdit.item === undefined && !items.length ? (isTags ? "Add a tag" : "Add an item") : ""
      }
      enterKeyHint="next"
      // A tag is written bare: a `#` typed before it is the pill's, not the name's.
      onDraft={(v) => r.onDraft(isTags ? v.replace(/^#+/, "") : v)}
      onKey={(e) => {
        // A tag can't hold a space or a comma: either ends it, as Enter does.
        const ends = e.key === "Enter" || (isTags && (e.key === "," || e.key === " "));
        if (ends && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (!listEdit.draft.trim() && e.key !== "Enter") return;
          settled.current = true;
          // Enter on an empty new item closes the field; else it saves and opens the next.
          r.onSaveList(!!listEdit.draft.trim() || listEdit.item !== undefined);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          settled.current = true;
          r.onCancel();
        } else if (e.key === "Backspace" && listEdit.item === undefined && !listEdit.draft) {
          e.preventDefault();
          r.onBackspaceList();
        }
      }}
      onBlur={() => {
        if (settled.current) return;
        r.onSaveList(false);
      }}
    />
  );
  // An item's ×, there while it is edited too: it removes the item, never saving the draft first
  // (the press keeps the field's focus, so no blur saves it).
  const removeX = (item: string, i: number) => (
    <button
      type="button"
      className="props-x"
      tabIndex={-1}
      aria-label={`Remove ${item}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        if (listEdit?.item === i) settled.current = true;
        r.onRemoveItem(i);
      }}
    >
      <RemoveItemIcon />
    </button>
  );
  // Each item is its text (a click edits it) and its × (removes it), kept together on a line.
  const itemNodes: ReactNode[] = items.map((item, i) =>
    listEdit?.item === i ? (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: a list may repeat an item
        key={i}
        className={isTags ? "props-item props-tag" : "props-item"}
        data-editing=""
      >
        {listField}
        {removeX(item, i)}
      </span>
    ) : (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: a list may repeat an item
        key={i}
        className={isTags ? "props-item props-tag" : "props-item"}
        data-armed={listEdit?.armed && newAt === i + 1 ? "" : undefined}
      >
        <button
          type="button"
          className="props-item-text"
          data-index={i}
          onMouseDown={(e) => {
            caretAt.current = pressOffset(e, e.currentTarget);
          }}
          onClick={(e) => {
            e.stopPropagation();
            r.onEditItem(i, caretAt.current);
            caretAt.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              r.onEditItem(i, null);
            } else if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              const to = e.currentTarget.closest(".props-list");
              r.onRemoveItem(i);
              // Focus goes to the item now in its place, else the one before.
              requestAnimationFrame(() => {
                const next =
                  to?.querySelector<HTMLElement>(`.props-item-text[data-index="${i}"]`) ??
                  to?.querySelector<HTMLElement>(`.props-item-text[data-index="${i - 1}"]`) ??
                  to?.querySelector<HTMLElement>(".props-empty-add");
                next?.focus({ preventScroll: true });
              });
            } else if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") {
              e.preventDefault();
              e.stopPropagation();
              r.onItemMenu(i, e.currentTarget);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.boojyPhoneAPI?.holdFelt();
            r.onItemMenu(i, e.currentTarget);
          }}
        >
          {item}
        </button>
        {removeX(item, i)}
      </span>
    ),
  );
  if (newAt >= 0) itemNodes.splice(newAt, 0, listField);

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
    // Unused space in the value adds an item at the end; an item edits itself.
    value = (
      <div
        className="props-val props-list"
        onMouseDown={(e) => {
          // A press on the space keeps an open new-item field's focus (and its caret).
          if (e.target === e.currentTarget && newAt >= 0) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget || newAt >= 0) return;
          r.onAddAt(items.length);
        }}
      >
        {items.length || listEdit ? (
          itemNodes
        ) : (
          <button
            type="button"
            className="props-empty props-empty-add"
            aria-label={`Add to ${p.key}`}
            onClick={() => r.onAddAt(0)}
          />
        )}
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
  enterKeyHint = "done",
  onDraft,
  onKey,
  onBlur,
}: {
  editing: Editing;
  className: string;
  type?: string;
  inputMode?: "decimal";
  placeholder?: string;
  enterKeyHint?: "done" | "next";
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
      enterKeyHint={enterKeyHint}
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
