# Issue: Negative Total Clamping & Adjustment Rules

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Secure the calculation engine against negative split totals:
- In the grand total math logic, ensure that if a Participant's subtotal is negative (e.g. from negative-price discount items or global negative adjustments), their final payable share is clamped to a minimum of `0.00`.
- Distribute negative Adjustments (such as discount subtotals) proportionally only based on positive participant subtotals to avoid divide-by-zero or negative ratio errors.

## Acceptance criteria

- [ ] Individual final payable totals cannot go below `0.00`.
- [ ] Global discounts are divided proportionally across positive participant subtotals without arithmetic division errors.
