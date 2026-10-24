import type { PassResult } from "./engine";

/**
 * Runs sync passes one at a time. Opening the app, a save, pull-to-refresh
 * and Dropbox's long-poll all call `request()`; a request made during a pass
 * is answered by one more pass after it, never by a second pass alongside,
 * because two passes acting on the same record could each resolve the same
 * clash. A pass that reports `again` is followed by another, up to a limit, so
 * a condition that keeps failing cannot spin.
 */
export function createSyncRunner(pass: () => Promise<PassResult>, { maxRepeats = 3 } = {}) {
  let running: Promise<PassResult> | null = null;
  let requested = false;

  async function loop(): Promise<PassResult> {
    let result: PassResult;
    let repeats = 0;
    try {
      do {
        requested = false;
        result = await pass();
        if (result.again && repeats < maxRepeats) {
          repeats++;
          requested = true;
        }
      } while (requested);
      return result;
    } finally {
      // Cleared in the same step as the last check of `requested`, so no
      // request can land in between and go unanswered.
      running = null;
    }
  }

  return {
    /** Resolves with the result of a pass that started after this call. */
    request(): Promise<PassResult> {
      if (running) {
        requested = true;
        return running;
      }
      running = loop();
      return running;
    },
  };
}
