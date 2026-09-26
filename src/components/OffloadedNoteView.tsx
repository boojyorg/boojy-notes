import { useTheme } from "../hooks/useTheme";
import { OffloadedIcon } from "./Icons";
import { SmallButton } from "./settings/SettingsPrimitives";

type Theme = { TEXT: Record<string, string> };

interface Props {
  /** `iCloud`, `Dropbox`…, or null when the location is not in a known service. */
  provider: string | null;
  failed: boolean;
  retry: () => void;
}

/**
 * In the note's place while its text downloads: a note a sync service keeps
 * online is never shown empty, and nothing can be typed into it until its
 * text is here. A failed download says so and offers another try.
 */
export default function OffloadedNoteView({ provider, failed, retry }: Props) {
  const { theme } = useTheme() as { theme: Theme };
  const from = provider ? ` from ${provider}` : "";
  return (
    <div
      data-testid="offloaded-note"
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingTop: 4,
        color: theme.TEXT.muted,
        fontSize: 14,
      }}
    >
      <OffloadedIcon />
      {failed ? (
        <>
          <span>Couldn’t download this note{from}. Check your connection.</span>
          <SmallButton onClick={retry}>Try again</SmallButton>
        </>
      ) : (
        <span>Downloading{from}…</span>
      )}
    </div>
  );
}
