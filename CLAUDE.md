# Working conventions for Claude

## One task = one fresh branch (default)

Do **each task on its own new branch**, created from the latest `origin/main`.
**Never reuse a branch across tasks.**

A branch and its pull request are single-use: once the PR merges, that branch
is finished. Pushing follow-up work to it afterwards silently orphans those
commits (they end up neither on `main` nor in an open PR). Starting each task
from a fresh branch avoids that entirely.

### Per-task workflow

1. `git fetch origin main`
2. `git checkout -B claude/<short-task-slug> origin/main`
3. Implement the change.
4. Verify: `npx tsc --noEmit` and `npm run build`.
5. Commit, `git push -u origin claude/<short-task-slug>`, and open a PR
   against `main`.

Branch naming: `claude/<short-task-slug>` — e.g. `claude/reschedule-local-time-feedback`.

If a task's PR has already merged and there's more to do, treat it as a **new
task**: start again from a new branch off the latest `origin/main`. Do not
reopen or push to the merged branch.
