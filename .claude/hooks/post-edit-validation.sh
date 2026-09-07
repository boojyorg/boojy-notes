#!/usr/bin/env bash
set -euo pipefail

# =========================================================================
# Boojy Notes — Post-Edit Validation Gate
# Ported from boojy-design's docs-system. Gates rewired for this stack:
#   format : biome check --write               (file-scoped, format + lint + safe fixes)
#   types  : pnpm typecheck (tsc --noEmit)      (project-wide, .ts/.tsx only)
#   tests  : pnpm exec vitest related           (file-scoped dependency graph)
# On any failure: prints the error to stderr and exits non-zero. (It does NOT write
# to any doc — session learnings live in git log + Claude Code auto memory.)
# =========================================================================

# ---- Config (the only stack-specific knobs) -----------------------------
EXT_REGEX='\.(js|jsx|ts|tsx)$'   # which edits trigger the gate
TS_REGEX='\.(ts|tsx)$'           # which edits additionally run typecheck
# -------------------------------------------------------------------------

JSON_INPUT=$(cat)
LOG=$(mktemp "${TMPDIR:-/tmp}/boojy-post-edit.XXXXXX")
trap 'rm -f "$LOG"' EXIT
FILE_PATH=$(echo "$JSON_INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

if [[ "$FILE_PATH" =~ $EXT_REGEX ]]; then
    echo "========================================="
    echo "⚙️  Auto-Validation Gate: Checking $FILE_PATH"
    echo "========================================="

    # ---- Gate 1: Biome format + lint + safe fixes (file-scoped) ----
    echo "▶️ Running Biome check..."
    if ! pnpm exec biome check --write "$FILE_PATH" > "$LOG" 2>&1; then
        echo "❌ Validation Failed: formatting/lint errors found." >&2
        cat "$LOG" >&2
        exit 1
    fi

    # ---- Gate 2: TypeScript typecheck (project-wide, only for .ts/.tsx edits) ----
    if [[ "$FILE_PATH" =~ $TS_REGEX ]]; then
        echo "▶️ Running TypeScript typecheck..."
        if ! pnpm typecheck > "$LOG" 2>&1; then
            echo "❌ Validation Failed: TypeScript compilation errors found." >&2
            cat "$LOG" >&2
                exit 1
        fi
    fi

    # ---- Gate 3: Vitest related suite (file-scoped) ----
    echo "▶️ Executing related Vitest suite..."
    if ! pnpm exec vitest related "$FILE_PATH" --run --passWithNoTests > "$LOG" 2>&1; then
        echo "❌ Validation Failed: dependent unit tests failed." >&2
        cat "$LOG" >&2
        exit 1
    fi

    echo "✅ Validation Passed: formatted, types verified, tests green."
fi

exit 0
