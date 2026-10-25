import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { useTheme } from "../../hooks/useTheme";
import { useExitGhost } from "../../hooks/useExitGhost";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Z } from "../../constants/zIndex";
import { atScale } from "../../utils/uiScale";
import { fontWeight } from "../../tokens/typography";
import { SCRIM, dialogSurface } from "./SettingsPrimitives";
import { CloseIcon } from "../Icons";
import { ChromeButton as ChromeButtonJsx } from "../EditorChrome";

const ChromeButton = ChromeButtonJsx as unknown as ComponentType<Record<string, unknown>>;

interface DialogShellProps {
  /** For a shell that stays mounted and renders nothing while closed (Settings). */
  open?: boolean;
  /** The dialog's accessible name. */
  label: string;
  /** The header's title, beside the Close button. */
  title: ReactNode;
  /** Every way out: ×, Escape, a click on the scrim. */
  onClose: () => void;
  closeAriaLabel?: string;
  width: number;
  padding: string;
  /** The air under the header. */
  headerGap: number;
  /** Extra attributes and style for the pane itself. */
  paneProps?: Record<string, unknown>;
  paneStyle?: CSSProperties;
  scrimTestId?: string;
  children: ReactNode;
}

/**
 * The frame Settings and first-run setup share: the scrim, the centred pane,
 * its header with Close, the focus trap, Escape and the exit copies.
 *
 * The pane is centred by a wrapper rather than by `translate(-50%, -50%)` on
 * itself: a transform would make the pane the containing block for anything
 * `fixed` inside it, and the wrapper is also what lets the pane carry a zoom
 * of its own without fighting percentage offsets. The wrapper takes no
 * pointer events, so a click beside the pane still reaches the scrim. Scrim
 * and wrapper are siblings, so each leaves its own copy (`useExitGhost`).
 *
 * Escape is heard on the document, so it runs before the shell's window
 * listener, and only for an Escape nothing above it has taken. A menu opened
 * from inside owns Escape even in the frame before focus reaches it, when its
 * own document listener, added after this one, would hear the key second.
 */
export function DialogShell({
  open = true,
  label,
  title,
  onClose,
  closeAriaLabel,
  width,
  padding,
  headerGap,
  paneProps,
  paneStyle,
  scrimTestId,
  children,
}: DialogShellProps) {
  const { theme } = useTheme();
  const paneRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const centreRef = useRef<HTMLDivElement>(null);
  useFocusTrap(paneRef as RefObject<HTMLElement>, open, "container");
  useExitGhost(scrimRef, open);
  useExitGhost(centreRef, open);

  // Read through a ref, so the listener is added once per open and keeps its
  // place before any menu's.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="menu"]')) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        ref={scrimRef}
        className="motion-fade"
        data-testid={scrimTestId}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: Z.SETTINGS, background: SCRIM }}
      />
      <div
        ref={centreRef}
        className="motion-from-center"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z.SETTINGS_INNER,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          ref={paneRef}
          // Grows in by `scale`, which is `none` at rest, so it never makes
          // the pane a containing block for `fixed` children (a transform would).
          className="motion-pop motion-from-center"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          {...paneProps}
          style={{
            pointerEvents: "auto",
            width,
            // Divided by the scale: `vw`/`vh` ignore the zoom the UI scale is
            // made of, so at 200% this pane would be twice the window.
            maxWidth: atScale("100vw - 32px"),
            maxHeight: atScale("100vh - 48px"),
            boxSizing: "border-box",
            padding,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            outline: "none",
            ...dialogSurface(theme),
            ...paneStyle,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 32,
              margin: `0 -8px ${headerGap}px 0`,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 17,
                fontWeight: fontWeight.semibold,
                color: theme.TEXT.primary,
              }}
            >
              {title}
            </div>
            <ChromeButton label="Close" ariaLabel={closeAriaLabel} onClick={onClose}>
              <CloseIcon />
            </ChromeButton>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
