# Issue: Skip Receipt Scan Fallback

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Provide a fallback action on the landing/capture step to let users skip OCR scanning and go directly to manual entry:
- Add a "Skip & Enter Manually" button to the capture screen next to the main receipt capture layout.
- Clicking the button should clear any active OCR parsing indicators, reset the split state, and transition `store.step` to `'edit'`.

## Acceptance criteria

- [ ] "Skip & Enter Manually" button is visible and styled on the landing capture view.
- [ ] Clicking the skip button navigates the user successfully to Step 2 (Edit Items).
- [ ] No OCR parsing calls or Gemini API keys are queried when utilizing the manual skip fallback.
