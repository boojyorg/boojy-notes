/**
 * `2026-10-15`, in local time: the day a conflicted copy or a recovered note
 * is named after, on the desktop and the phone alike. UTC (`toISOString`)
 * named a copy made just after midnight in summer time after yesterday.
 */
export const localDay = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
