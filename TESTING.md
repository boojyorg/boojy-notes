# Testing All Platforms

Boojy Notes runs on Desktop (Electron), Web (PWA), iOS (Capacitor), and Android (Capacitor). This doc covers how to build, run, and test each.

## Prerequisites

| Tool | Required for |
|------|-------------|
| Node.js (v18+) | All platforms |
| Xcode (latest) | iOS |
| Android Studio | Android |
| CocoaPods | iOS (`sudo gem install cocoapods`) |

**iOS Simulator:** Install via Xcode → Settings → Platforms → iOS.

**Android Emulator:** Open Android Studio → Virtual Device Manager → Create a device with a recent API level.

## Unit Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (re-runs on file changes)
npm run test:coverage # Run with coverage report
```

## Linting & Formatting

```bash
npm run lint          # Check for lint errors
npm run lint:fix      # Auto-fix lint errors
npm run format:check  # Check formatting (runs in CI)
npm run format        # Auto-format files
```

Run `npm test` and `npm run format:check` before committing to catch CI failures early.

## Desktop (Electron)

### Development

```bash
npm run dev
```

This starts Vite + Electron in dev mode with hot reload.

### Build Installer

```bash
npm run build:electron
```

Produces platform-specific installers (`.dmg` on macOS, `.exe`/NSIS on Windows, `.AppImage` on Linux) in the `dist/` output directory.

## Web (PWA)

**Important:** All non-Electron commands require `ELECTRON_DISABLE=1` to exclude Electron-specific code. The `dev:web` script sets this automatically.

### Development

```bash
npm run dev:web
```

### Production Preview

```bash
ELECTRON_DISABLE=1 npm run build
npm run preview
```

### Deployment

Web deploys automatically to [boojy.org](https://boojy.org) via Cloudflare Pages on every push to `master`. The Cloudflare build command is `ELECTRON_DISABLE=1 npm run build`, serving from `dist/`.

## iOS (Capacitor)

### Sync & Open in Xcode

```bash
npm run cap:sync:ios   # Build web assets + sync to iOS project
npm run cap:open       # Open in Xcode
```

Then in Xcode, select a simulator or connected device and hit Run (⌘R).

### Live Reload (Development)

1. Start the dev server with your local IP exposed:

```bash
npm run dev:ios        # Runs: ELECTRON_DISABLE=1 vite --host
```

2. Note the Network URL printed by Vite (e.g., `http://192.168.1.42:5173`).

3. Temporarily add a `server` block to `capacitor.config.ts`:

```ts
const config: CapacitorConfig = {
  appId: "org.boojy.notes",
  appName: "Boojy Notes",
  webDir: "dist",
  server: {
    url: "http://192.168.1.42:5173",  // your Network URL
    cleartext: true,
  },
  plugins: {
    SplashScreen: { launchAutoHide: false },
    Keyboard: { resize: "none", resizeOnFullScreen: false },
  },
};
```

4. Sync and re-run in Xcode:

```bash
npx cap sync ios
```

5. **Remove the `server` block before committing.**

## Android (Capacitor)

> **App ID:** `org.boojy.notes` (not `com.boojy.notes` — this matters for `adb` commands).

### Sync & Open in Android Studio

```bash
npm run cap:sync:android   # Build web assets + sync to Android project
npm run cap:open:android   # Open in Android Studio
```

Then select an emulator or connected device and hit Run.

### CLI-Only Flow (No Android Studio UI)

If you prefer building and deploying from the terminal:

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n org.boojy.notes/.MainActivity
```

### Live Reload (Development)

Same approach as iOS — start `npm run dev:android`, add the `server` block to `capacitor.config.ts` with your Network URL, sync, and run. Remember to remove the `server` block before committing.

### AGP Version Mismatch

If Android Studio warns about an unsupported Android Gradle Plugin (AGP) version, you can downgrade it in `android/build.gradle` to match your Studio version. For example, change:

```groovy
classpath 'com.android.tools.build:gradle:8.9.0'
```

to the version Android Studio recommends. This only affects local builds.

## Sync All Platforms (Capacitor)

To build web assets and sync to both iOS and Android at once:

```bash
npm run cap:sync
```

This runs `ELECTRON_DISABLE=1 npm run build && npx cap sync`.
