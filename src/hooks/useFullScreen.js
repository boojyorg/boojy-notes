import { useEffect, useState } from "react";

/**
 * Whether the window is in macOS full screen, where the traffic lights are
 * gone and the inset that clears them (MAC_TRAFFIC_INSET) would be dead space
 * in front of the wordmark and the collapsed control group.
 *
 * The main process is the only thing that knows: this asks it once at mount
 * (a renderer can load already in full screen, on a reload or a window
 * restored to it) and then follows its enter and leave events. False on the
 * web and wherever the API is absent (an older preload, a test mock), which
 * leaves every inset exactly as it was.
 */
export function useFullScreen() {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.onFullScreenChanged) return undefined;
    let live = true;
    api
      .isFullScreen?.()
      .then((on) => {
        if (live) setFullScreen(Boolean(on));
      })
      .catch(() => {});
    const unsubscribe = api.onFullScreenChanged((on) => setFullScreen(Boolean(on)));
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return fullScreen;
}
