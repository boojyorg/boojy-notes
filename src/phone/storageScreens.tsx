import { createRoot } from "react-dom/client";
import { ThemeProvider } from "../context/ThemeContext";
import type { PickedFolder } from "./folderFiles";
import { FolderLost, MovingNotes, NotMoved, PhoneSetup } from "./PhoneSetup";

/**
 * A screen in the app's place before the app exists (the vault is built on
 * its answer): its own small tree with the theme alone, gone once answered.
 */
function ask<T>(screen: (done: (answer: T) => void) => React.ReactNode): Promise<T> {
  return new Promise((resolve) => {
    const root = createRoot(document.getElementById("root") as HTMLElement);
    const done = (answer: T) => {
      root.unmount();
      resolve(answer);
    };
    root.render(<ThemeProvider>{screen(done)}</ThemeProvider>);
  });
}

/** A location added later was backed out of at its folder: it is not added after all. */
export const CANCELLED = "cancelled";

/**
 * First launch, or the first start of a storage location just added (by its
 * name): the folder chosen, null for the app's own storage, or `CANCELLED`
 * for an added location backed out of. `taken` are other locations' folders.
 */
export const askStorage = (
  folderName: string,
  granted: PickedFolder | null,
  location?: string,
  taken: string[] = [],
) =>
  ask<PickedFolder | null | typeof CANCELLED>((done) => (
    <PhoneSetup
      folderName={folderName}
      granted={granted}
      location={location}
      taken={taken}
      onCancel={() => done(CANCELLED)}
      onDone={done}
    />
  ));

/** The chosen folder is out of reach: the folder chosen again, never another location's. */
export const askFolderAgain = (taken: string[] = []) =>
  ask<PickedFolder>((done) => <FolderLost taken={taken} onDone={done} />);

/** A move to a folder under way: its count, until `close`. */
export function showMoving() {
  const root = createRoot(document.getElementById("root") as HTMLElement);
  const progress = (done: number, total: number) =>
    root.render(
      <ThemeProvider>
        <MovingNotes done={done} total={total} />
      </ThemeProvider>,
    );
  progress(0, 0);
  return { progress, close: () => root.unmount() };
}

/** The move failed: said, and the app opens on its own storage once read. */
export const sayNotMoved = (reason: string) =>
  ask<void>((done) => <NotMoved reason={reason} onDone={() => done()} />);
