import { type CSSProperties, useLayoutEffect, useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { drawnScale } from "../utils/uiScale";

/**
 * The style that holds a Settings surface at the interface size it opened
 * with. While it is open the app resizes under every press of Interface
 * size, but the surface keeps its size and place: one that grows as you
 * press the button inside it moves that button out from under the finger or
 * pointer. It is not excluded from the scale: the next time it opens it is
 * drawn at whatever the scale is then.
 *
 * `zoom` nests multiplicatively, so the surface's own cancels the difference
 * exactly; the local `--ui-scale` keeps the viewport-unit maths resolving
 * against the surface's scale rather than the app's (`atScale`). Captured in
 * a layout effect, so the first paint of an open surface is already at its
 * own scale; deliberately not on `uiScale`: the capture is the opening.
 */
export function useHeldScale(open: boolean): CSSProperties {
  const { uiScale } = useSettings() as { uiScale: number };
  const [openedAt, setOpenedAt] = useState(uiScale);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the opening is the capture, never a later scale
  useLayoutEffect(() => {
    if (open) setOpenedAt(uiScale);
  }, [open]);
  return {
    zoom: openedAt === uiScale ? undefined : openedAt / uiScale,
    "--ui-scale": drawnScale(openedAt) / 100,
  } as CSSProperties;
}
