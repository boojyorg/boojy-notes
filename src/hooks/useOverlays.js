import { useCallback, useRef, useState } from "react";

/**
 * The surfaces that float over the app: the context menu, the confirm dialog,
 * the lightbox and the editor's suggestion menus. Held by the root alone; the
 * menus' refs let native handlers read the open menu without a render.
 */
export function useOverlays() {
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

  return {
    ctxMenu,
    setCtxMenu,
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
  };
}
