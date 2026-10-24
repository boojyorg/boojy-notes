import { useRef } from "react";

/**
 * An inline rename field: a sidebar row's (a note's on double-click or F2, a
 * folder's from its menu or F2) and a version's in Version History.
 * Finder-style, it arrives with the whole name selected. Enter or a blur
 * renames, once: Enter unmounts the field, and the blur that can
 * follow must not rename again. Escape renames nothing. Enter and Escape are
 * the field's own (prevented), and a press stays in it, since rows open,
 * toggle and drag. `onKeyClose` hands focus back after a key closed it.
 */
export default function RenameField({
  name,
  label,
  placeholder,
  style,
  onRename,
  onClose,
  onKeyClose,
}) {
  const done = useRef(false);
  const close = (field, value, byKey) => {
    if (done.current) return;
    done.current = true;
    if (value !== null) onRename(value);
    onClose();
    if (byKey) onKeyClose(field, value);
  };
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the field opens because the user asked to name the row
      autoFocus
      defaultValue={name}
      placeholder={placeholder}
      aria-label={label}
      data-testid="rename-field"
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => close(e.currentTarget, e.currentTarget.value, false)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== "Escape") return;
        e.preventDefault();
        close(e.currentTarget, e.key === "Enter" ? e.currentTarget.value : null, true);
      }}
      style={style}
    />
  );
}
