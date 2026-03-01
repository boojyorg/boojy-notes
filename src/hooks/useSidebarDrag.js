import { useRef } from "react";
import { runAutoScroll } from "../utils/domHelpers";
import { FOLDER_TREE } from "../constants/data";

export function useSidebarDrag({
  noteDataRef, setNoteData,
  expanded, setExpanded,
  sidebarOrder, setSidebarOrder, customFolders,
  sidebarScrollRef,
  accentColor, chromeBg,
  setDragTooltip, dragTooltipCount,
}) {
  const sidebarDrag = useRef({
    active: false,
    type: null,
    id: null,
    cloneEl: null,
    holdTimer: null,
    startX: 0, startY: 0,
    dropTarget: null,
    dropIndicator: null,
    autoExpandTimer: null,
    scrollRAF: null,
    originalFolder: null,
  });

  const persistSidebarOrder = (folderPath, noteIds, folderIds) => {
    const meta = {};
    if (noteIds) meta.noteOrder = noteIds;
    if (folderIds) meta.folderOrder = folderIds;
    setSidebarOrder(prev => ({ ...prev, [folderPath]: { ...(prev[folderPath] || {}), ...meta } }));
    if (window.electronAPI?.writeMeta) {
      window.electronAPI.writeMeta(folderPath, { ...(sidebarOrder[folderPath] || {}), ...meta });
    }
  };

  const activateSidebarDrag = (type, id, el, pointerY) => {
    const sd = sidebarDrag.current;
    sd.active = true;
    sd.type = type;
    sd.id = id;

    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    Object.assign(clone.style, {
      position: "fixed",
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      height: rect.height + "px",
      zIndex: "1000",
      pointerEvents: "none",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      opacity: "0.85",
      transform: "scale(1.02)",
      background: chromeBg,
      borderRadius: "6px",
      transition: "none",
    });
    document.body.appendChild(clone);
    sd.cloneEl = clone;
    sd.startY = pointerY;
    sd.offsetY = pointerY - rect.top;

    if (type === "note") {
      sd.originalFolder = noteDataRef.current[id]?.folder || null;
    }

    const indicator = document.createElement("div");
    Object.assign(indicator.style, {
      position: "fixed",
      height: "2px",
      background: accentColor,
      borderRadius: "1px",
      zIndex: "999",
      pointerEvents: "none",
      display: "none",
      transition: "top 50ms ease, left 50ms ease",
    });
    document.body.appendChild(indicator);
    sd.dropIndicator = indicator;

    document.body.classList.add("block-dragging");

    const scrollEl = sidebarScrollRef.current;
    let lastPointerY = pointerY;
    const scrollLoop = () => {
      if (!sd.active) return;
      runAutoScroll(scrollEl, lastPointerY);
      sd.scrollRAF = requestAnimationFrame(scrollLoop);
    };
    sd.scrollRAF = requestAnimationFrame(scrollLoop);
    sd._updatePointerY = (y) => { lastPointerY = y; };
  };

  const updateSidebarDropTarget = (pointerX, pointerY) => {
    const sd = sidebarDrag.current;
    if (!sd.active) return;
    const scrollEl = sidebarScrollRef.current;
    if (!scrollEl) return;
    const scrollRect = scrollEl.getBoundingClientRect();

    if (pointerX < scrollRect.left || pointerX > scrollRect.right ||
        pointerY < scrollRect.top || pointerY > scrollRect.bottom) {
      if (sd.dropIndicator) sd.dropIndicator.style.display = "none";
      sd.dropTarget = null;
      scrollEl.querySelectorAll("[data-folder-path]").forEach(el => el.style.background = "none");
      return;
    }

    let target = null;
    const noteEls = scrollEl.querySelectorAll("[data-note-id]");
    const folderEls = scrollEl.querySelectorAll("[data-folder-path]");

    folderEls.forEach(el => el.style.background = "none");

    for (const el of folderEls) {
      const rect = el.getBoundingClientRect();
      if (pointerY >= rect.top && pointerY <= rect.bottom) {
        const folderPath = el.dataset.folderPath;
        if (sd.type === "folder" && (folderPath === sd.id || folderPath.startsWith(sd.id + "/"))) continue;
        const third = rect.height / 3;
        if (pointerY < rect.top + third) {
          target = { type: "folder", id: folderPath, zone: "above", rect };
        } else if (pointerY > rect.bottom - third) {
          target = { type: "folder", id: folderPath, zone: "below", rect };
        } else {
          target = { type: "folder", id: folderPath, zone: "into", rect };
        }
        break;
      }
    }
    if (!target) {
      for (const el of noteEls) {
        const rect = el.getBoundingClientRect();
        if (pointerY >= rect.top && pointerY <= rect.bottom) {
          const noteId = el.dataset.noteId;
          if (noteId === sd.id) continue;
          const half = rect.height / 2;
          target = {
            type: "note",
            id: noteId,
            zone: pointerY < rect.top + half ? "above" : "below",
            rect,
          };
          break;
        }
      }
    }

    sd.dropTarget = target;

    if (!target) {
      if (sd.dropIndicator) sd.dropIndicator.style.display = "none";
      return;
    }

    if (target.zone === "into") {
      const folderEl = scrollEl.querySelector(`[data-folder-path="${target.id}"]`);
      if (folderEl) folderEl.style.background = `${accentColor}25`;
      if (sd.dropIndicator) sd.dropIndicator.style.display = "none";
      if (!expanded[target.id]) {
        if (!sd.autoExpandTimer) {
          sd.autoExpandTimer = setTimeout(() => {
            setExpanded(prev => ({ ...prev, [target.id]: true }));
            sd.autoExpandTimer = null;
          }, 500);
        }
      }
    } else {
      if (sd.autoExpandTimer) { clearTimeout(sd.autoExpandTimer); sd.autoExpandTimer = null; }
      const lineY = target.zone === "above" ? target.rect.top : target.rect.bottom;
      if (sd.dropIndicator) {
        Object.assign(sd.dropIndicator.style, {
          display: "block",
          top: (lineY - 1) + "px",
          left: (target.rect.left + 4) + "px",
          width: (target.rect.width - 8) + "px",
        });
      }
    }
  };

  const finalizeSidebarDrag = () => {
    const sd = sidebarDrag.current;
    if (!sd.active) return;
    const target = sd.dropTarget;

    if (target) {
      if (sd.type === "note" && target.zone === "into" && target.type === "folder") {
        const noteId = sd.id;
        const targetFolder = target.id;
        setNoteData(prev => {
          const next = { ...prev };
          next[noteId] = { ...next[noteId], folder: targetFolder };
          return next;
        });
      } else if (sd.type === "note") {
        const draggedNote = noteDataRef.current[sd.id];
        const draggedFolder = draggedNote?.folder || "";
        let targetFolder = "";
        if (target.type === "note") {
          targetFolder = noteDataRef.current[target.id]?.folder || "";
        } else if (target.type === "folder") {
          const parts = target.id.split("/");
          targetFolder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
        }

        if (draggedFolder === targetFolder) {
          const folderKey = draggedFolder;
          const noteIds = Object.entries(noteDataRef.current)
            .filter(([, n]) => (n.folder || "") === folderKey)
            .map(([id]) => id);
          const currentOrder = sidebarOrder[folderKey]?.noteOrder || noteIds;
          const ordered = [...currentOrder];
          for (const id of noteIds) { if (!ordered.includes(id)) ordered.push(id); }
          const filtered = ordered.filter(id => noteIds.includes(id));
          const fromIdx = filtered.indexOf(sd.id);
          if (fromIdx !== -1) filtered.splice(fromIdx, 1);
          let toIdx = filtered.length;
          if (target.type === "note") {
            const tIdx = filtered.indexOf(target.id);
            toIdx = target.zone === "above" ? tIdx : tIdx + 1;
          }
          filtered.splice(Math.max(0, toIdx), 0, sd.id);
          persistSidebarOrder(folderKey, filtered, null);
        } else {
          setNoteData(prev => {
            const next = { ...prev };
            next[sd.id] = { ...next[sd.id], folder: targetFolder || null };
            return next;
          });
        }
      } else if (sd.type === "folder") {
        const parts = sd.id.split("/");
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
        const targetParts = target.id.split("/");
        const targetParent = targetParts.length > 1 ? targetParts.slice(0, -1).join("/") : "";

        if (parentPath === targetParent && target.zone !== "into") {
          const parentKey = parentPath;
          const folderNames = [];
          if (parentPath === "") {
            folderNames.push(...FOLDER_TREE.map(f => f.name), ...customFolders);
          }
          const currentOrder = sidebarOrder[parentKey]?.folderOrder || folderNames;
          const ordered = [...currentOrder];
          for (const n of folderNames) { if (!ordered.includes(n)) ordered.push(n); }
          const filtered = ordered.filter(n => folderNames.includes(n));
          const dragName = parts[parts.length - 1];
          const fromIdx = filtered.indexOf(dragName);
          if (fromIdx !== -1) filtered.splice(fromIdx, 1);
          let toIdx = filtered.length;
          if (target.type === "folder") {
            const tName = targetParts[targetParts.length - 1];
            const tIdx = filtered.indexOf(tName);
            toIdx = target.zone === "above" ? tIdx : tIdx + 1;
          }
          filtered.splice(Math.max(0, toIdx), 0, dragName);
          persistSidebarOrder(parentKey, null, filtered);
        }
      }
    }

    cleanupSidebarDrag();
  };

  const cleanupSidebarDrag = () => {
    const sd = sidebarDrag.current;
    if (sd.cloneEl && sd.cloneEl.parentNode) sd.cloneEl.parentNode.removeChild(sd.cloneEl);
    if (sd.dropIndicator && sd.dropIndicator.parentNode) sd.dropIndicator.parentNode.removeChild(sd.dropIndicator);
    if (sd.scrollRAF) { cancelAnimationFrame(sd.scrollRAF); sd.scrollRAF = null; }
    if (sd.autoExpandTimer) { clearTimeout(sd.autoExpandTimer); sd.autoExpandTimer = null; }
    if (sidebarScrollRef.current) {
      sidebarScrollRef.current.querySelectorAll("[data-folder-path]").forEach(el => el.style.background = "none");
    }
    document.body.classList.remove("block-dragging");
    sd.active = false;
    sd.type = null;
    sd.id = null;
    sd.cloneEl = null;
    sd.holdTimer = null;
    sd.dropTarget = null;
    sd.dropIndicator = null;
    sd.originalFolder = null;
    sd._updatePointerY = null;
  };

  const cancelSidebarDrag = () => {
    const sd = sidebarDrag.current;
    if (sd.holdTimer) { clearTimeout(sd.holdTimer); sd.holdTimer = null; }
    if (!sd.active) { cleanupSidebarDrag(); return; }
    if (sd.type === "note" && sd.originalFolder !== undefined) {
      const noteId = sd.id;
      const origFolder = sd.originalFolder;
      setNoteData(prev => {
        if (prev[noteId]?.folder !== origFolder) {
          const next = { ...prev };
          next[noteId] = { ...next[noteId], folder: origFolder };
          return next;
        }
        return prev;
      });
    }
    cleanupSidebarDrag();
  };

  const handleSidebarPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".delete-btn, input")) return;

    const noteEl = e.target.closest("[data-note-id]");
    const folderEl = e.target.closest("[data-folder-path]");
    if (!noteEl && !folderEl) return;

    if (!localStorage.getItem("boojy-drag-tooltip-sidebar")) {
      dragTooltipCount.current.sidebar++;
      if (dragTooltipCount.current.sidebar === 3) {
        localStorage.setItem("boojy-drag-tooltip-sidebar", "1");
        setDragTooltip({ x: e.clientX, y: e.clientY - 40, text: "Hold and drag to reorder" });
        setTimeout(() => setDragTooltip(null), 3000);
      }
    }

    const type = noteEl ? "note" : "folder";
    const id = noteEl ? noteEl.dataset.noteId : folderEl.dataset.folderPath;
    const targetEl = noteEl || folderEl;

    const sd = sidebarDrag.current;
    sd.startX = e.clientX;
    sd.startY = e.clientY;

    const pY = e.clientY;
    sd.holdTimer = setTimeout(() => {
      activateSidebarDrag(type, id, targetEl, pY);
    }, 400);

    const onMove = (ev) => {
      if (sd.holdTimer && !sd.active) {
        const dx = ev.clientX - sd.startX;
        const dy = ev.clientY - sd.startY;
        if (Math.hypot(dx, dy) > 5) {
          clearTimeout(sd.holdTimer);
          sd.holdTimer = null;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        }
        return;
      }
      if (sd.active) {
        if (sd.cloneEl) {
          sd.cloneEl.style.top = (ev.clientY - sd.offsetY) + "px";
        }
        if (sd._updatePointerY) sd._updatePointerY(ev.clientY);
        updateSidebarDropTarget(ev.clientX, ev.clientY);
      }
    };
    const onUp = () => {
      if (sd.holdTimer) { clearTimeout(sd.holdTimer); sd.holdTimer = null; }
      if (sd.active) finalizeSidebarDrag();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return { sidebarDrag, handleSidebarPointerDown, cancelSidebarDrag, persistSidebarOrder };
}
