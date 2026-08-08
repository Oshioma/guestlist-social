# Working conventions for Claude

## Always open a NEW pull request (check every time)

Every deliverable goes on its **own new pull request**. Do **not** reuse an
existing PR or just edit its description to fold in new work — open a fresh PR
and share the link. Before finishing any change, check that the work is on a
new PR, not stacked onto an old one.

### Check the merge state BEFORE writing new code

The repeated failure mode: a PR gets merged, then more commits are pushed to the
same branch — those commits land **neither on `main` nor in any open PR** and
are silently lost until someone notices. Prevent it by checking first, every
time, before starting a new job:

1. `git fetch origin main`
2. `git log --oneline origin/main..HEAD` — the commits on the branch not yet on
   `main`.
   - **Empty** → the branch's work is fully merged. Start the new job from a
     clean base: `git checkout -B <branch> origin/main`.
   - **Non-empty but the PR is already merged** → those commits are stranded.
     `git rebase origin/main` to drop the already-merged ones and replay the
     rest, then open a **new** PR for them.
3. Only then implement, verify (`npx tsc --noEmit` && `npm run build`), push, and
   open a fresh PR against `main`.

Rule of thumb: **one job → one new PR.** Never assume the last PR is still open —
verify it, because merged PRs cannot absorb new commits.

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
