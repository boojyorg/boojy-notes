import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Opening an offloaded note downloads it (`downloadOffloaded` adopts the
 * text, which ends the offloaded state). Null while the open note is not
 * offloaded; otherwise whether the last try failed, and another try.
 */
export function useOffloadedNote(
  activeNote: string | null,
  offloaded: boolean,
  download: (id: string) => Promise<boolean>,
): { failed: boolean; retry: () => void } | null {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!activeNote || !offloaded) return;
    let live = true;
    setFailedFor(null);
    download(activeNote).then(
      (ok) => live && !ok && setFailedFor(activeNote),
      () => live && setFailedFor(activeNote),
    );
    return () => {
      live = false;
    };
    // `download` is rebuilt with its hook; the note and the try decide.
  }, [activeNote, offloaded, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const failed = failedFor === activeNote;
  const shown = !!activeNote && offloaded;
  return useMemo(() => (shown ? { failed, retry } : null), [shown, failed, retry]);
}
