/** How often the folder is looked at while the app stays in front. */
const LOOK_EVERY_MS = 30_000;

/**
 * When the phone looks for what other apps changed in its notes folder
 * (`checkOutside` in `phoneVault.ts`): thoroughly each time the app comes
 * back to the front, and quickly every half minute while it stays there, as
 * a sync tool running behind it would change a note the person is about to
 * open. Never while the app is in the background.
 *
 * One look at a time: one asked for meanwhile runs after it, thorough if any
 * asked was. A look that fails asks whether the folder is still there; gone,
 * `lost` is called (the start asks for the folder again), and nothing else
 * is done about a failure: the next look tries again.
 */
export function watchOutside({
  check,
  stillThere,
  lost,
  everyMs = LOOK_EVERY_MS,
}: {
  check: (o: { thorough: boolean }) => Promise<void>;
  stillThere: () => Promise<boolean>;
  lost: () => void;
  everyMs?: number;
}) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  /** A look asked for while one ran: whether it is to be thorough. */
  let owed: boolean | null = null;
  let gone = false;

  const run = async (thorough: boolean) => {
    if (gone) return;
    if (running) {
      owed = owed || thorough;
      return;
    }
    running = true;
    try {
      await check({ thorough });
    } catch (error) {
      // Unsure whether it is there (the question itself failed) is not lost.
      if (!(await stillThere().catch(() => true))) {
        gone = true;
        clearInterval(timer);
        return lost();
      }
      console.warn("[folder] look failed:", error);
    } finally {
      running = false;
    }
    if (owed !== null) {
      const next = owed;
      owed = null;
      run(next);
    }
  };

  return {
    /** The app is in front (`thorough`: it just came back) or went to the background. */
    active(isActive: boolean, thorough = isActive) {
      clearInterval(timer);
      if (!isActive) return;
      timer = setInterval(() => run(false), everyMs);
      if (thorough) run(true);
    },
  };
}
