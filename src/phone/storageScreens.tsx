import { createRoot } from "react-dom/client";
import { ThemeProvider } from "../context/ThemeContext";
import type { PickedFolder } from "./folderFiles";
import { FolderLost, PhoneSetup } from "./PhoneSetup";

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

/** First launch: the folder chosen, or null for the app's own storage. */
export const askStorage = (folderName: string, granted: PickedFolder | null) =>
  ask<PickedFolder | null>((done) => (
    <PhoneSetup folderName={folderName} granted={granted} onDone={done} />
  ));

/** The chosen folder is out of reach: the folder chosen again. */
export const askFolderAgain = () => ask<PickedFolder>((done) => <FolderLost onDone={done} />);
