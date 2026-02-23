# Claude Code Instructions

You have full access to read all files in this repository. Do not ask before reading files — just read them directly when needed.

## Changelog Workflow

When making bug fixes or feature changes:
1. Update `CHANGELOG.md` immediately after each fix
2. Add entries under the "Unreleased" section at the top
3. Use categories: `### Bug Fixes`, `### Features`, `### Improvements`
4. When releasing, change "Unreleased" to the version number and date

## Project Structure

- `ui/` - Flutter frontend
- `ui/lib/` - Dart application code
  - `screens/` - Main views
  - `widgets/` - Reusable UI components
  - `widgets/shared/` - Shared widgets (buttons, dropdowns, toggles)
  - `widgets/painters/` - Custom painters
  - `widgets/start_screen/` - Start screen components
  - `services/` - Business logic and platform services
  - `models/` - Data models
  - `state/` - State management
  - `theme/` - Theme system and colors
  - `constants/` - Shared constants
  - `utils/` - Utility functions
- `ui/windows/` - Windows platform code
- `ui/macos/` - macOS platform code
- `ui/ios/` - iOS platform code
- `ui/web/` - Web platform code

## Release Process

1. Update CHANGELOG.md with release date
2. Commit all changes
3. Tag with version: `git tag v0.x.x && git push origin v0.x.x`
4. Build and distribute

## Code Signing Secrets (GitHub)

- `MACOS_CERTIFICATE` - Base64-encoded .p12 file (use `-legacy` flag when exporting)
- `MACOS_CERTIFICATE_PWD` - Password for the .p12
- `DEVELOPER_ID` - Full signing identity name
- `APPLE_APP_PASSWORD` - App-specific password from appleid.apple.com
