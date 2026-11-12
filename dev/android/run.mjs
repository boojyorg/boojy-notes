/**
 * `pnpm android`: builds the phone's web bundle, copies it into the Android
 * project, installs the debug app on the phone connected by USB and opens it.
 * Dev only. Needs the Android SDK (ANDROID_HOME) and a JDK 21, found with
 * macOS's java_home. With a phone and an emulator both connected,
 * ANDROID_SERIAL names the one (`adb devices`).
 *
 * `pnpm android --live`: the installed app loads the Vite dev server instead
 * (port 5175, reached through `adb reverse`), so an edit shows on the phone
 * at once. The server is started here if none is running, and the command
 * then stays up with it (Ctrl-C ends both). Run a plain `pnpm android` to go
 * back. `pnpm android --tweak` is `--live` opened with the dev size panel
 * (`dev/PhoneTweaker.jsx`).
 *
 * `pnpm android --test-app`: installs "Boojy Notes (test)" (`org.boojy.notes.test`)
 * beside the everyday app, with its own storage, for trying sign-ins and
 * storage with notes that don't matter. Combines with `--live`. Chosen
 * unasked on a phone whose everyday app came from Google Play: that one is
 * signed with another key, and Android will not put this build over it.
 */
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const LIVE_PORT = 5175;
const tweak = process.argv.includes("--tweak");
// The panel is part of a dev build alone, so asking for it asks for the dev server.
const live = tweak || process.argv.includes("--live");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const javaHome = execFileSync("/usr/libexec/java_home", ["-v", "21"]).toString().trim();
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME, "Library/Android/sdk");
const bin = (name) => path.join("node_modules", ".bin", name);
const adb = path.join(sdk, "platform-tools", "adb");

/** Whether the phone's everyday app was installed by Google Play (false if it can't be asked). */
function everydayAppIsFromPlay() {
  try {
    const listed = execFileSync(adb, ["shell", "pm", "list", "packages", "-i", "org.boojy.notes"], {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    return /^package:org\.boojy\.notes\s+installer=com\.android\.vending\s*$/m.test(listed);
  } catch {
    return false;
  }
}

let testApp = process.argv.includes("--test-app");
if (!testApp && everydayAppIsFromPlay()) {
  console.log(
    "The everyday app on this phone is Google Play's: installing Boojy Notes (test) beside it.",
  );
  testApp = true;
}
const appId = testApp ? "org.boojy.notes.test" : "org.boojy.notes";
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  ...(live && { BOOJY_LIVE_URL: `http://localhost:${LIVE_PORT}${tweak ? "/?tweak" : ""}` }),
  // The page knows too: the test app alone offers a notes folder at first launch, for now.
  ...(testApp && { BOOJY_TEST_APP: "1", VITE_BOOJY_TEST_APP: "1" }),
};

/** Whether something answers on the dev server's port. */
const serverUp = () =>
  new Promise((resolve) => {
    const socket = net.connect(LIVE_PORT, "localhost");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

run(bin("vite"), ["build", "--mode", "phone"], { env });
run(bin("cap"), ["sync", "android"], { env });
run("./gradlew", ["installDebug", "-q"], { cwd: "android", env });
if (live) {
  // The dev server, unless one is running already (`pnpm dev:phone`): the app
  // opens once it answers, and this command stays up for as long as it does.
  if (!(await serverUp())) {
    const server = spawn(
      bin("vite"),
      ["--mode", "phone", "--port", String(LIVE_PORT), "--strictPort"],
      { stdio: "inherit", env },
    );
    server.once("exit", (code) => process.exit(code ?? 0));
    // The server goes when this command does, however it is ended: a Ctrl-C
    // reaches both, a signal sent to this process alone does not.
    process.once("exit", () => server.kill());
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      process.once(signal, () => process.exit(0));
    for (let tries = 0; !(await serverUp()); tries++) {
      if (tries > 100) throw new Error(`The dev server did not answer on port ${LIVE_PORT}.`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  run(adb, ["reverse", `tcp:${LIVE_PORT}`, `tcp:${LIVE_PORT}`]);
}
run(adb, ["shell", "am", "start", "-n", `${appId}/org.boojy.notes.MainActivity`]);
