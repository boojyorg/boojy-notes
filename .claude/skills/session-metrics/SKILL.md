---
name: session-metrics
description: Use when the user requests a detailed summary of session statistics, line velocity, or project progress. Runs in two phases — a read-only metrics Report, then a Persist step that appends a session_ledger.md entry and syncs dreams.md.
disable-model-invocation: false
---

# Session Metrics Guide

Two phases. **Always do Phase 1 (Report).** Do **Phase 2 (Persist)** unless the user
explicitly asked for "just the report" / "read-only".

---

## Phase 1 — Report (read-only)

Goal: summarise this session's footprint. **You already know what changed from the
conversation — the git commands are a cross-check, not the source of truth.**

> ⚠️ Do NOT use `git diff $(git merge-base master HEAD)`. This repo works **directly on
> `master`**, so the merge-base is `HEAD` and that diff is always empty.

Scope the session's real change with whichever fits:

```bash
# Unpushed work + working tree (best mid-session, before a push):
git diff --stat @{u}..HEAD 2>/dev/null; git diff --stat

# Already pushed? Scope by the session's own commits (adjust the count/since):
git log --oneline -10
git show --stat <session-first-sha>..HEAD 2>/dev/null   # range of this session's commits
```

Summarise: **files changed, +/− lines, largest-changed files**, and call out work that does
**not** show in a diff (tags pushed, PRs closed, CI/deploy state, untracked-file edits like
`dreams.md`). Note when the session was *operational* (release/PR ops) rather than code — a
tiny diff is the right outcome there, not a red flag.

**Cost / telemetry:** the skill cannot read token/$ spend. Point the user at `/cost` for exact
figures; only describe cost qualitatively (subagents used, expensive verifications run, context
size). Never fabricate dollar amounts.

---

## Phase 2 — Persist (writes two files)

### 2a. Append a `session_ledger.md` entry

File: `.claude/history/session_ledger.md`. It is an **append-only flight recorder — never edit
existing entries.** Insert the new entry **newest-first: directly after the `## YYYY-MM-DD …`
template block's closing `---`, immediately above the previous dated entry.**

Entry template (match the existing entries' style):

```markdown
## YYYY-MM-DD · <short session title> · <branch>

### Session Work

| Task | Outcome |
|---|---|
| <task> | <what happened + short SHA if committed> |

### Gates

| Gate | Result |
|---|---|
| typecheck | |
| lint / format:check | |
| test / coverage | |
| E2E | |
| build / release | |
| CI (post-push) | |

### Code velocity

<N commits, M files, ±lines>. Note if operational vs code session.

### Cost / telemetry

Per `/cost` (or "not separately captured"). Qualitative drivers only.

### Notes — next session targets

1. <carry-forward item>
```

Use the real current date (see the `currentDate` context). Convert relative dates to absolute.

### 2b. Sync `dreams.md` (live working memory — distinct from the ledger)

- §1 **Active Engineering Target**: update the **Status** line and tick milestone checkboxes
  `- [ ]` → `- [x]` for anything resolved this session.
- §2 **Automated Incident Logs**: if gates are green, clear back to `_None open._`
- §3 **Known Gotchas**: add any new gotcha discovered; mark fixed ones `[FIXED YYYY-MM-DD]`.

Keep `dreams.md` (current state) and `session_ledger.md` (historical audit trail) consistent
but distinct — the ledger records what happened; dreams.md records what's still true/open.

---

## Notes

- If the user says "just the report" / "read-only", stop after Phase 1.
- `dreams.md` may be untracked — edit it in place regardless; do not newly `git add` it unless
  the user asks.
