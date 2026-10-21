import { useState } from "react";
import { attachmentUrls } from "../utils/attachmentUrl";

/** The address each source last loaded from, so a note opened again goes straight there. */
const found = new Map<string, string>();

/** The places to try, the one that last worked first. */
function placesFor(src: string) {
  const urls = attachmentUrls(src) as string[];
  const last = found.get(src);
  return last && urls.includes(last) ? [last, ...urls.filter((u) => u !== last)] : urls;
}

/**
 * An attachment's address for an `<img>`, moving on to the next place it may
 * be (`attachmentUrls`) when a load fails. `next()` says whether one was left:
 * false means the file is not found. `loaded()` remembers the place that
 * worked. The order is fixed when a source is first seen, so remembering
 * mid-load never reshuffles it.
 */
export function useAttachmentSrc(src: string) {
  const [state, setState] = useState(() => ({ src, places: placesFor(src), tried: 0 }));
  // A new source starts from its first address (state adjusted in render).
  const current = state.src === src ? state : { src, places: placesFor(src), tried: 0 };
  if (current !== state) setState(current);
  const url = current.places[current.tried] ?? "";
  return {
    url,
    next: () => {
      if (current.tried + 1 >= current.places.length) return false;
      setState({ ...current, tried: current.tried + 1 });
      return true;
    },
    loaded: () => {
      if (url) found.set(src, url);
    },
  };
}
