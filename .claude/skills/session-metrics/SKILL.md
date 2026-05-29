---
name: session-metrics
description: Use when the user requests a detailed summary of session statistics, line velocity, or project progress. Runs in two phases — a read-only metrics Report, then a Persist step that syncs dreams.md §1. (Session history lives in git log + Claude Code auto memory, not a ledger.)
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

## Phase 2 — Persist (syncs `dreams.md` §1)

Session **history** is no longer hand-written — `git log` is the audit trail, and Claude Code
auto memory captures learnings/gotchas. So Persist is just keeping the live working state honest:
update `dreams.md` §1 to reflect what's now true.

- **Status line:** update to the current reality (shipped version, what's live, CI state, whether
  a target is in flight).
- **Milestone checklist:** tick `- [ ]` → `- [x]` for anything resolved this session.
- **Backlog (unscheduled):** add genuinely-open follow-ups discovered this session; remove items
  that got resolved. Keep it to *actionable open work* — resolved gotchas and learnings belong in
  git log / auto memory, not here.

Use the real current date (see the `currentDate` context). Convert relative dates to absolute.

A new **durable** gotcha (a rule future sessions must follow, not a one-off) belongs in a committed
file — `CLAUDE.md` or `.claude/rules/` — not only in auto memory.

---

## Notes

- If the user says "just the report" / "read-only", stop after Phase 1.
- `dreams.md` may be untracked — edit it in place regardless; do not newly `git add` it unless
  the user asks.
