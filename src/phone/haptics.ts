import { registerPlugin } from "@capacitor/core";

/** The app's own native plugin (android/…/HoldFeelPlugin.java). */
const HoldFeel = registerPlugin<{ held(): Promise<void> }>("HoldFeel");

/**
 * One tap of the system's long-press feel, the moment a hold is recognised.
 * Android leaves it out when Touch feedback is off; a phone without the
 * plugin (an older install) just stays still.
 */
export function holdFelt(): void {
  HoldFeel.held().catch(() => {});
}
