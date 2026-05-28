import { useState, useEffect, useRef } from "react";

/**
 * Detects virtual keyboard visibility and height on mobile browsers.
 * Uses the visualViewport API (works on iOS Safari + Android Chrome).
 */
export function useKeyboard() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const initialViewportHeight = useRef(null);

  useEffect(() => {
    // Use visualViewport API — supported on iOS Safari 13+ and Android Chrome
    const vv = window.visualViewport;
    if (!vv) return;

    if (initialViewportHeight.current === null) {
      initialViewportHeight.current = vv.height;
    }

    const onResize = () => {
      const heightDiff = initialViewportHeight.current - vv.height;
      // Consider keyboard open if viewport shrunk by >100px
      const open = heightDiff > 100;
      setIsKeyboardVisible(open);
      setKeyboardHeight(open ? heightDiff : 0);
    };

    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return { isKeyboardVisible, keyboardHeight };
}
