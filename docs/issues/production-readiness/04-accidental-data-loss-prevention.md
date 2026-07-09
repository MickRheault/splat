# Issue: Accidental Data Loss Prevention Prompts

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Introduce warning confirmations before destructive user actions:
- Intercept the full Reset button trigger in the footer. If the item list or participant list is populated, trigger `window.confirm`.
- Intercept new scan upload paths (camera capture, gallery upload, demo template selection). If there is an active split already populated, prompt the user with a confirmation warning before overwriting.

## Acceptance criteria

- [ ] Confirm alert displays when tapping "Reset" with populated list items.
- [ ] Confirm alert displays when uploading another receipt image or selecting a demo template when an active split is already configured.
- [ ] Action aborts safely if the user selects "Cancel" on the confirmation prompt.
