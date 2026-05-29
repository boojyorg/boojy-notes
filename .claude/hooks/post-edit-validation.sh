#!/usr/bin/env bash
set -euo pipefail

# =========================================================================
# Boojy Notes — Post-Edit Validation Gate
# Ported from boojy-design's docs-system. Gates rewired for this stack:
#   format : biome check --write               (file-scoped, format + lint + safe fixes)
#   types  : pnpm typecheck (tsc --noEmit)      (project-wide, .ts/.tsx only)
#   tests  : pnpm exec vitest related           (file-scoped dependency graph)
# On any failure: logs an incident checkbox into dreams.md §2 and exits 1.
# =========================================================================

# ---- Config (the only stack-specific knobs) -----------------------------
EXT_REGEX='\.(js|jsx|ts|tsx)$'   # which edits trigger the gate
TS_REGEX='\.(ts|tsx)$'           # which edits additionally run typecheck
# -------------------------------------------------------------------------

log_failure_to_dreams() {
    local phase="$1"
    local file="$2"
    local error_log="$3"

    touch dreams.md

    local clean_log
    clean_log=$(echo "$error_log" | sed -r "s/\x1B\[([0-9]{1,3}(;[0-9]{1,3})*)?[mGK]//g" | head -n 8)

    local incident_block
    incident_block=$(cat << EOF
- [ ] **Fix $phase Failure in \`$file\`**
  \`\`\`text
  $clean_log
  \`\`\`
EOF
)

    if grep -q "### 🚨 Automated Incident Logs" dreams.md; then
        echo "$incident_block" > .incident_block.tmp
        awk '
            /### 🚨 Automated Incident Logs/ {
                print
                while ((getline line < ".incident_block.tmp") > 0) print line
                close(".incident_block.tmp")
                next
            }
            { print }
        ' dreams.md > .dreams.tmp && mv .dreams.tmp dreams.md
        rm -f .incident_block.tmp
    else
        echo -e "\n### 🚨 Automated Incident Logs\n$incident_block" >> dreams.md
    fi
}

JSON_INPUT=$(cat)
FILE_PATH=$(echo "$JSON_INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

if [[ "$FILE_PATH" =~ $EXT_REGEX ]]; then
    echo "========================================="
    echo "⚙️  Auto-Validation Gate: Checking $FILE_PATH"
    echo "========================================="

    # ---- Gate 1: Biome format + lint + safe fixes (file-scoped) ----
    echo "▶️ Running Biome check..."
    if ! pnpm exec biome check --write "$FILE_PATH" > .lint_errors.log 2>&1; then
        echo "❌ Validation Failed: formatting/lint errors found." >&2
        log_failure_to_dreams "Biome Check" "$FILE_PATH" "$(cat .lint_errors.log)"
        rm -f .lint_errors.log
        exit 1
    fi
    rm -f .lint_errors.log

    # ---- Gate 2: TypeScript typecheck (project-wide, only for .ts/.tsx edits) ----
    if [[ "$FILE_PATH" =~ $TS_REGEX ]]; then
        echo "▶️ Running TypeScript typecheck..."
        if ! pnpm typecheck > .ts_errors.log 2>&1; then
            echo "❌ Validation Failed: TypeScript compilation errors found." >&2
            log_failure_to_dreams "TypeScript Typecheck" "$FILE_PATH" "$(cat .ts_errors.log)"
            rm -f .ts_errors.log
            exit 1
        fi
        rm -f .ts_errors.log
    fi

    # ---- Gate 3: Vitest related suite (file-scoped) ----
    echo "▶️ Executing related Vitest suite..."
    if ! pnpm exec vitest related "$FILE_PATH" --run --passWithNoTests > .test_errors.log 2>&1; then
        echo "❌ Validation Failed: dependent unit tests failed." >&2
        log_failure_to_dreams "Vitest Related Suite" "$FILE_PATH" "$(cat .test_errors.log)"
        rm -f .test_errors.log
        exit 1
    fi
    rm -f .test_errors.log

    echo "✅ Validation Passed: formatted, types verified, tests green."
fi

exit 0
