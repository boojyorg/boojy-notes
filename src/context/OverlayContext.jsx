import { createContext, useState, useRef, useContext, useMemo, useCallback } from "react";

const OverlayContext = createContext(null);

export function OverlayProvider({ children }) {
  const [ctxMenu, setCtxMenu] = useState(null);

  // Promise-based confirmation dialog for destructive actions.
  // requestConfirm(opts) shows the themed dialog and resolves to true/false.
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolveRef = useRef(null);
  const requestConfirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmState(opts || {});
      }),
    [],
  );
  const resolveConfirm = useCallback((result) => {
    setConfirmState(null);
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    resolve?.(result);
  }, []);

  const [dragTooltip, setDragTooltip] = useState(null);
  const dragTooltipCount = useRef({ editor: 0, sidebar: 0 });
  const [lightbox, setLightbox] = useState(null);
  const [slashMenu, setSlashMenu] = useState(null);
  const slashMenuRef = useRef(null);
  slashMenuRef.current = slashMenu;
  const [wikilinkMenu, setWikilinkMenu] = useState(null);
  const wikilinkMenuRef = useRef(null);
  wikilinkMenuRef.current = wikilinkMenu;
  const [tagMenu, setTagMenu] = useState(null);
  const tagMenuRef = useRef(null);
  tagMenuRef.current = tagMenu;

  const value = useMemo(
    () => ({
      ctxMenu,
      setCtxMenu,
      dragTooltip,
      setDragTooltip,
      dragTooltipCount,
      lightbox,
      setLightbox,
      slashMenu,
      setSlashMenu,
      slashMenuRef,
      wikilinkMenu,
      setWikilinkMenu,
      wikilinkMenuRef,
      tagMenu,
      setTagMenu,
      tagMenuRef,
      confirmState,
      requestConfirm,
      resolveConfirm,
    }),
    [
      ctxMenu,
      dragTooltip,
      lightbox,
      slashMenu,
      wikilinkMenu,
      tagMenu,
      confirmState,
      requestConfirm,
      resolveConfirm,
    ],
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error("useOverlay must be used within OverlayProvider");
  return ctx;
}
