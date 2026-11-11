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

/**
 * First launch, or the first start of a storage location just added (by its
 * name): the folder chosen, or null for the app's own storage.
 */
export const askStorage = (folderName: string, granted: PickedFolder | null, location?: string) =>
  ask<PickedFolder | null>((done) => (
    <PhoneSetup folderName={folderName} granted={granted} location={location} onDone={done} />
  ));

/** The chosen folder is out of reach: the folder chosen again. */
export const askFolderAgain = () => ask<PickedFolder>((done) => <FolderLost onDone={done} />);

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
