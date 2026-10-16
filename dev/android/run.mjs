/**
 * `pnpm android`: builds the phone's web bundle, copies it into the Android
 * project, installs the debug app on the phone connected by USB and opens it.
 * Dev only (proof of concept, Dropbox sync step 2). Needs the Android SDK
 * (ANDROID_HOME) and a JDK 21, found with macOS's java_home. With a phone and
 * an emulator both connected, ANDROID_SERIAL names the one (`adb devices`).
 *
 * `pnpm android --live`: the installed app loads the Vite dev server instead
 * (`pnpm dev:phone`, port 5175, reached through `adb reverse`), so an edit
 * shows on the phone at once. Run a plain `pnpm android` to go back.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const LIVE_PORT = 5175;
const live = process.argv.includes("--live");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const javaHome = execFileSync("/usr/libexec/java_home", ["-v", "21"]).toString().trim();
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME, "Library/Android/sdk");
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  ...(live && { BOOJY_LIVE_URL: `http://localhost:${LIVE_PORT}` }),
};
const bin = (name) => path.join("node_modules", ".bin", name);
const adb = path.join(sdk, "platform-tools", "adb");

run(bin("vite"), ["build", "--mode", "phone"]);
run(bin("cap"), ["sync", "android"], { env });
run("./gradlew", ["installDebug", "-q"], { cwd: "android", env });
if (live) run(adb, ["reverse", `tcp:${LIVE_PORT}`, `tcp:${LIVE_PORT}`]);
run(adb, ["shell", "am", "start", "-n", "org.boojy.notes/.MainActivity"]);
