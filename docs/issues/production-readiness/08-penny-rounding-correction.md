# Issue: Penny-Rounding Correction Rules

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Document and verify the penny-rounding correction behavior in the math engine:
- Double-check that the rounding error (difference between original bill total and the sum of rounded participant shares) is calculated at the end of the breakdown mapping.
- Apply this remaining rounding error (usually +/- $0.01) to the Participant who has the highest total share to minimize percentage impact.

## Acceptance criteria

- [ ] Sum of rounded participant totals exactly equals the overall Bill total.
- [ ] Rounding remainders are added/subtracted to the highest individual payer's total.
