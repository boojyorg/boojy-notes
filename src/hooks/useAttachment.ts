import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { getAPI } from "../services/apiProvider";
import { attachmentRef } from "../utils/attachmentPath";
import { resolveAttachmentUrl } from "../utils/attachmentUrl";

/** The open note's folder (vault-relative, null at the root): where its embeds are read from. */
export const AttachmentFolder = createContext<string | null>(null);

// Every answer holds until a file that is not a note arrives or goes, or the
// vault changes (`attachments-changed`); then each embed asks again. Kept
// across notes, so a note opened again draws its pictures in the first paint.
const answers = new Map<string, string | null>();
let generation = 0;
const listeners = new Set<() => void>();
let listening = false;

/** The desktop's or the phone's vault, where an embed's file is looked up; none on the web. */
interface AttachmentAPI {
  locateAttachment?: (
    src: string,
    folder: string | null,
    markdown?: boolean,
  ) => Promise<string | null>;
  onAttachmentsChanged?: (cb: () => void) => unknown;
}
const vaultAPI = () => getAPI() as AttachmentAPI | undefined;

/** Ask every embed again (a file was found or copied in). */
export function recheckAttachments() {
  generation++;
  answers.clear();
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void) {
  if (!listening) {
    listening = true;
    vaultAPI()?.onAttachmentsChanged?.(recheckAttachments);
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const currentGeneration = () => generation;

export interface Attachment {
  /** The vault path of the file the embed names; null when it names none, undefined while asking. */
  rel: string | null | undefined;
  /** What an `<img>` loads: the file's address, or `src` itself for a web address. */
  url: string;
  /** The vault was asked and holds no such file. */
  missing: boolean;
}

/**
 * The file an embed names, found as Obsidian finds it (`attachmentPath.ts`),
 * from the open note's folder. The answer is held: Copy, Open, Show in Finder
 * and the size use `rel`, the file drawn, never the embed's text again. While
 * a re-check is out the last answer stays, so a picture never blinks.
 * `markdown`: a `![](…)` address, read as a URL.
 */
export function useAttachment(src: string, markdown = false): Attachment {
  const folder = useContext(AttachmentFolder);
  const gen = useSyncExternalStore(subscribe, currentGeneration);
  const inVault = !!vaultAPI()?.locateAttachment && attachmentRef(src, markdown) !== null;
  const key = `${folder ?? ""}\0${markdown ? 1 : 0}\0${src}`;
  const cached = answers.get(key);
  const [held, setHeld] = useState<{ key: string; rel: string | null } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a re-check (`gen`) clears the answers, and every embed asks again
  useEffect(() => {
    if (!inVault || answers.has(key)) return;
    let live = true;
    const askedAt = generation;
    const locate = vaultAPI()?.locateAttachment;
    if (!locate) return;
    locate(src, folder, markdown).then((rel) => {
      if (askedAt === generation) answers.set(key, rel);
      if (live) setHeld({ key, rel });
    });
    return () => {
      live = false;
    };
  }, [inVault, key, src, folder, markdown, gen]);

  if (!inVault) return { rel: null, url: src, missing: false };
  const rel = answers.has(key)
    ? (cached as string | null)
    : held?.key === key
      ? held.rel
      : undefined;
  return { rel, url: rel ? resolveAttachmentUrl(rel) : "", missing: rel === null };
}
