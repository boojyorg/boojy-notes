/**
 * `pnpm android`: builds the phone's web bundle, copies it into the Android
 * project, installs the debug app on the phone connected by USB and opens it.
 * Dev only (proof of concept, Dropbox sync step 2). Needs the Android SDK
 * (ANDROID_HOME) and a JDK 21, found with macOS's java_home.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const javaHome = execFileSync("/usr/libexec/java_home", ["-v", "21"]).toString().trim();
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME, "Library/Android/sdk");
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };
const bin = (name) => path.join("node_modules", ".bin", name);

run(bin("vite"), ["build", "--mode", "phone"]);
run(bin("cap"), ["sync", "android"], { env });
run("./gradlew", ["installDebug", "-q"], { cwd: "android", env });
run(path.join(sdk, "platform-tools", "adb"), [
  "shell",
  "am",
  "start",
  "-n",
  "org.boojy.notes/.MainActivity",
]);
