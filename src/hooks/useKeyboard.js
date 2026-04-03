import { useState, useEffect, useRef } from "react";
import { isCapacitor } from "../utils/platform";

/**
 * Detects virtual keyboard visibility and height on mobile.
 * Uses visualViewport API (works on iOS Safari + Android Chrome)
 * and Capacitor Keyboard plugin events when available.
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

  // Capacitor Keyboard plugin — more reliable on native
  useEffect(() => {
    if (!isCapacitor) return;
    let cleanup = null;

    import("@capacitor/keyboard").then(({ Keyboard }) => {
      const showListener = Keyboard.addListener("keyboardWillShow", (info) => {
        setIsKeyboardVisible(true);
        setKeyboardHeight(info.keyboardHeight);
      });
      const hideListener = Keyboard.addListener("keyboardWillHide", () => {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      });
      cleanup = () => {
        showListener.then((h) => h.remove());
        hideListener.then((h) => h.remove());
      };
    });

    return () => cleanup?.();
  }, []);

  return { isKeyboardVisible, keyboardHeight };
}
