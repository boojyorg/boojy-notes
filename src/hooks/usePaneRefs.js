import { useRef } from "react";

export function usePaneRefs() {
  const editorRef = useRef(null);
  const editorScrollRef = useRef(null);
  const titleRef = useRef(null);
  const blockRefs = useRef({});
  const focusBlockId = useRef(null);
  const focusCursorPos = useRef(null);

  return {
    editorRef,
    editorScrollRef,
    titleRef,
    blockRefs,
    focusBlockId,
    focusCursorPos,
  };
}
