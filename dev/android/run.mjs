/**
 * `pnpm android`: builds the phone's web bundle, copies it into the Android
 * project, installs the debug app on the phone connected by USB and opens it.
 * Dev only. Needs the Android SDK (ANDROID_HOME) and a JDK 21, found with
 * macOS's java_home. With a phone and an emulator both connected,
 * ANDROID_SERIAL names the one (`adb devices`).
 *
 * `pnpm android --live`: the installed app loads the Vite dev server instead
 * (`pnpm dev:phone`, port 5175, reached through `adb reverse`), so an edit
 * shows on the phone at once. Run a plain `pnpm android` to go back.
 * `pnpm android --tweak` is `--live` opened with the dev size panel
 * (`dev/PhoneTweaker.jsx`).
 *
 * `pnpm android --test-app`: installs "Boojy Notes (test)" (`org.boojy.notes.test`)
 * beside the everyday app, with its own storage, for trying sign-ins and
 * storage with notes that don't matter. Combines with `--live`.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const LIVE_PORT = 5175;
const tweak = process.argv.includes("--tweak");
// The panel is part of a dev build alone, so asking for it asks for the dev server.
const live = tweak || process.argv.includes("--live");
const testApp = process.argv.includes("--test-app");
const appId = testApp ? "org.boojy.notes.test" : "org.boojy.notes";
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const javaHome = execFileSync("/usr/libexec/java_home", ["-v", "21"]).toString().trim();
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME, "Library/Android/sdk");
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  ...(live && { BOOJY_LIVE_URL: `http://localhost:${LIVE_PORT}${tweak ? "/?tweak" : ""}` }),
  // The page knows too: the test app alone offers a notes folder at first launch, for now.
  ...(testApp && { BOOJY_TEST_APP: "1", VITE_BOOJY_TEST_APP: "1" }),
};
const bin = (name) => path.join("node_modules", ".bin", name);
const adb = path.join(sdk, "platform-tools", "adb");

run(bin("vite"), ["build", "--mode", "phone"], { env });
run(bin("cap"), ["sync", "android"], { env });
run("./gradlew", ["installDebug", "-q"], { cwd: "android", env });
if (live) run(adb, ["reverse", `tcp:${LIVE_PORT}`, `tcp:${LIVE_PORT}`]);
run(adb, ["shell", "am", "start", "-n", `${appId}/org.boojy.notes.MainActivity`]);
