# Issue: Verify and Ensure Spacious Final Splits Layout

Status: ready-for-agent

## Parent

PRD: `docs/prd/mobile-status-and-paywall-improvements.md`

## What to build

Verify that the final splits card layout on Step 4 (Share step) has sufficient vertical spacing.
- Ensure the participant totals wrapper container in `src/App.vue` uses `flex flex-col gap-5` (or a grid with equivalent spacing).
- Verify that adjacent rows have enough gap to prevent the border and background of one row from overlapping/obscuring the bottom block shadow of the row above it.

## Acceptance criteria

- [ ] Vertical spacing between participant rows on Step 4 is verified to be spacious (`gap-5` or at least 20px).
- [ ] Block shadows on all participant cards are fully visible and not clipped or hidden by adjacent elements.
- [ ] No regression of the line/row list layout for participant splits.

## Blocked by

None - can start immediately.
