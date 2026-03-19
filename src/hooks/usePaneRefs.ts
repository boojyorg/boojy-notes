import { useRef, type RefObject } from "react";

interface PaneRefs {
  editorRef: RefObject<HTMLDivElement | null>;
  editorScrollRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLDivElement | null>;
  blockRefs: RefObject<Record<string, HTMLElement>>;
  focusBlockId: RefObject<string | null>;
  focusCursorPos: RefObject<number | null>;
}

export function usePaneRefs(): PaneRefs {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Record<string, HTMLElement>>({});
  const focusBlockId = useRef<string | null>(null);
  const focusCursorPos = useRef<number | null>(null);

  return {
    editorRef,
    editorScrollRef,
    titleRef,
    blockRefs,
    focusBlockId,
    focusCursorPos,
  };
}
