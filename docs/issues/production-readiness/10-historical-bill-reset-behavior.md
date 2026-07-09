# Issue: Historical Bill Reset Behavior

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Improve the UX of the "Reset" action when viewing/modifying a restored historical bill:
- Track whether the active split has been edited since it was loaded or created using a state flag `isModified` (initialized to `false`, set to `true` on mutations, and reset on load/reset).
- If the active split is a loaded historical split (meaning its `splitId` exists in the saved splits history):
  - If the user has NOT modified the split (`isModified === false`), clicking "Reset" should immediately reset the store and return to the landing capture page without any confirmation prompts.
  - If the user HAS modified the split (`isModified === true`), clicking "Reset" should show a confirmation prompt: "Are you sure you want to discard your edits? The original saved bill in history will not be affected."
- If the active split is a new split, retain the standard reset confirmation warning if any items or participants are present.

## Acceptance criteria

- [ ] `isModified` state flag is updated correctly on all split state changes (adding, editing, removing items/participants/category/currency/adjustments/tips).
- [ ] Resetting an unmodified restored history split returns to the landing page immediately without confirmation.
- [ ] Resetting a modified restored history split displays a confirmation message clarifying that the history copy is safe.
