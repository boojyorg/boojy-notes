/**
 * The Android app bundle (AAB) Google Play takes, signed with the upload key
 * (`android/app/build.gradle` reads it from ~/Documents/Keys, or the file
 * BOOJY_ANDROID_SIGNING names). Its version is package.json's. Prints where
 * the bundle is and refuses an unsigned one.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const javaHome = execFileSync("/usr/libexec/java_home", ["-v", "21"]).toString().trim();
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME, "Library/Android/sdk");
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };
const bin = (name) => path.join("node_modules", ".bin", name);

run(bin("vite"), ["build", "--mode", "phone"]);
run(bin("cap"), ["sync", "android"], { env });
run("./gradlew", ["bundleRelease", "-q"], { cwd: "android", env });

const aab = path.join("android", "app", "build", "outputs", "bundle", "release", "app-release.aab");
if (!existsSync(aab)) throw new Error(`No bundle at ${aab}`);
const verified = execFileSync(path.join(javaHome, "bin", "jarsigner"), ["-verify", aab]).toString();
if (!verified.includes("jar verified")) throw new Error(`The bundle is not signed:\n${verified}`);
console.log(`\nSigned bundle: ${path.resolve(aab)}`);
