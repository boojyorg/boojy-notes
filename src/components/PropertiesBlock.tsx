import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import type { Block, NoteData } from "../types/notes";
import { readNoteIds, withNoteId, writeNoteIds } from "../utils/noteIdLists";
import { type Property, readProperties, shownDate } from "../utils/properties";
import { ChevronDownIcon, PropertyTypeIcon, SourceViewIcon } from "./Icons";
import { Tooltip, useTooltip } from "./Tooltip";

/** The notes whose Properties section is folded on this device; open is the default. */
export const FOLDED_PROPERTIES_KEY = "boojy-folded-properties";

const TYPE_LABEL: Record<string, string> = {
  text: "Text",
  list: "List",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  datetime: "Date & time",
  tags: "Tags",
  untyped: "No type yet",
  nested: "Changed only as YAML",
};

/**
 * What a property's icon says, for the two names Boojy keeps without using:
 * honest that the app does nothing with them yet.
 */
const UNUSED_TIP: Record<string, string> = {
  aliases: "Other names for this note in Obsidian. Boojy doesn't use them in links or Search yet.",
  cssclasses: "Styles this note in Obsidian. Boojy keeps it but doesn't use it.",
};

/** The icon a property shows: its type, the meaning its name fixes, or why it can't be changed here. */
export function iconFor(p: Property): string {
  if (p.fixed === "tags" || p.fixed === "aliases") return p.fixed;
  if (p.fixed === "cssclasses") return "list";
  if (!p.editable) return "nested";
  return p.type ?? "untyped";
}

function PropertyIcon({ property }: { property: Property }) {
  const ref = useRef<HTMLSpanElement>(null);
  const tip = useTooltip();
  const type = iconFor(property);
  const label = UNUSED_TIP[property.key] ?? TYPE_LABEL[type] ?? "";
  return (
    <>
      <span ref={ref} className="props-icon" aria-label={label} role="img" {...tip.handlers}>
        <PropertyTypeIcon type={type} />
      </span>
      {tip.shown && <Tooltip label={label} anchor={ref.current} placement="below" />}
    </>
  );
}

function PropertyValue({ property: p }: { property: Property }) {
  if (!p.editable) return <span className="props-muted">{String(p.shown ?? "")}</span>;
  if (p.shown === null) return <span className="props-empty" />;
  if (p.type === "checkbox") {
    return (
      <input
        type="checkbox"
        className="props-cb"
        checked={p.shown === true}
        readOnly
        tabIndex={-1}
        aria-label={p.key}
        aria-readonly="true"
        onChange={() => {}}
      />
    );
  }
  if (Array.isArray(p.shown)) {
    if (!p.shown.length) return <span className="props-empty" />;
    const pill = p.fixed === "tags" ? "props-pill props-tag" : "props-pill";
    return (
      <>
        {p.shown.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a list may repeat an item
          <span key={i} className={pill}>
            {item}
          </span>
        ))}
      </>
    );
  }
  const text = String(p.shown);
  if (p.type === "date" || p.type === "datetime") return <>{shownDate(text)}</>;
  if (p.type === "number") return <span className="props-num">{text}</span>;
  return <>{text}</>;
}

interface PropertiesBlockProps {
  block: Block;
  noteId: string;
  blockIndex: number;
  syncGen: number;
  noteDataRef?: RefObject<NoteData>;
  onUpdateText: (noteId: string, blockIndex: number, text: string) => void;
}

/**
 * A note's frontmatter as its properties: a quiet section at the top, open
 * by default, one row per property (type icon, name, value), and `</>` to
 * edit the YAML itself. YAML the rows cannot read opens as YAML, with nothing
 * written through rows. Folding is remembered per note on this device.
 */
export default function PropertiesBlock({
  block,
  noteId,
  blockIndex,
  syncGen,
  noteDataRef,
  onUpdateText,
}: PropertiesBlockProps) {
  const text = block.text ?? "";
  const read = readProperties(text);
  const [folded, setFolded] = useState(() => readNoteIds(FOLDED_PROPERTIES_KEY).includes(noteId));
  const [asYaml, setAsYaml] = useState(false);
  // YAML the rows can't read opens as YAML, and stays so once it reads again,
  // so mending it never swaps the field away under the caret.
  useEffect(() => {
    if (!read.ok) setAsYaml(true);
  }, [read.ok]);
  const yamlView = asYaml || !read.ok;

  const toggleFold = useCallback(() => {
    setFolded((was) => {
      writeNoteIds(
        FOLDED_PROPERTIES_KEY,
        withNoteId(readNoteIds(FOLDED_PROPERTIES_KEY), noteId, !was),
      );
      return !was;
    });
  }, [noteId]);

  const yamlBtn = useRef<HTMLButtonElement>(null);
  const foldBtn = useRef<HTMLButtonElement>(null);
  const yamlTip = useTooltip();
  const foldTip = useTooltip();
  const yamlLabel = yamlView ? "Back to properties" : "Edit as YAML";

  return (
    <section
      className="props"
      data-properties=""
      data-folded={folded ? "" : undefined}
      data-yaml={yamlView ? "" : undefined}
      aria-label="Properties"
    >
      <div className="props-head">
        <button
          type="button"
          className="props-title"
          data-label="Properties"
          aria-label="Properties"
          aria-expanded={!folded}
          onClick={toggleFold}
        />
        {!folded && (
          <span className="props-tools">
            <button
              ref={yamlBtn}
              type="button"
              className="props-tool"
              aria-label={yamlLabel}
              aria-pressed={yamlView}
              aria-disabled={!read.ok || undefined}
              {...yamlTip.handlers}
              onClick={() => read.ok && setAsYaml((on) => !on)}
            >
              <SourceViewIcon />
            </button>
            {yamlTip.shown && (
              <Tooltip label={yamlLabel} anchor={yamlBtn.current} placement="below" />
            )}
          </span>
        )}
        <button
          ref={foldBtn}
          type="button"
          className="props-tool props-chev"
          aria-label={folded ? "Show properties" : "Hide properties"}
          aria-expanded={!folded}
          {...foldTip.handlers}
          onClick={toggleFold}
        >
          <ChevronDownIcon />
        </button>
        {foldTip.shown && (
          <Tooltip label={folded ? "Show" : "Hide"} anchor={foldBtn.current} placement="below" />
        )}
      </div>
      {!folded &&
        (yamlView ? (
          <YamlField
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            syncGen={syncGen}
            noteDataRef={noteDataRef}
            onUpdateText={onUpdateText}
            notice={
              read.ok ? null : "These properties can't be shown as rows, so they're shown as YAML."
            }
          />
        ) : (
          <div className="props-rows">
            {read.props.map((p) => (
              <div key={p.key} className="props-row" data-key={p.key}>
                <PropertyIcon property={p} />
                <span className="props-name">{p.key}</span>
                <span className="props-value">
                  <PropertyValue property={p} />
                </span>
              </div>
            ))}
          </div>
        ))}
    </section>
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
