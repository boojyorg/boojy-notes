/**
 * Whether a mouse event was made by a finger: Chromium (the Android app's
 * WebView, and a touchscreen laptop) follows a tap with compatibility mouse
 * events, and marks them as coming from a device that fires touch events.
 * Hover handlers return on these, or a tapped control keeps its hover look
 * until the next tap lands elsewhere.
 */
export function fromTouch(e: { nativeEvent?: Event } | Event): boolean {
  const native = ("nativeEvent" in e && e.nativeEvent ? e.nativeEvent : e) as Event & {
    sourceCapabilities?: { firesTouchEvents?: boolean } | null;
  };
  return !!native.sourceCapabilities?.firesTouchEvents;
}
