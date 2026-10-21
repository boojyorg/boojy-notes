import { useState } from "react";
import { attachmentUrls } from "../utils/attachmentUrl";

/**
 * An attachment's address for an `<img>`, moving on to the next place it may
 * be (`attachmentUrls`) when a load fails. `next()` says whether one was left;
 * false means the file is not found.
 */
export function useAttachmentSrc(src: string) {
  const [state, setState] = useState({ src, at: 0 });
  // A new source starts from its first address (state adjusted in render).
  if (state.src !== src) setState({ src, at: 0 });
  const urls = attachmentUrls(src) as string[];
  const at = state.src === src ? state.at : 0;
  return {
    url: urls[at] ?? "",
    next: () => {
      if (at + 1 >= urls.length) return false;
      setState({ src, at: at + 1 });
      return true;
    },
  };
}
