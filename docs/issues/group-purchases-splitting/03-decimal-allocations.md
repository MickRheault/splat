# Issue: Decimal & Weighted Allocations

Status: open

## Parent

PRD: `docs/prd/group-purchases-splitting.md`

## What to build

Allow users to allocate fractional/decimal quantities on split-by-quantity items:
- Replace the read-only assigned quantity count inside Step 3 item details with a numeric text input field.
- Ensure the input handles floating-point numbers (e.g. `1.5`, `3.25`).
- Ensure the math engine computes proportional shares based on these float ratios cleanly without errors.

## Acceptance criteria

- [ ] Users can type decimal numbers directly into the item allocation fields.
- [ ] Calculations split costs accurately according to custom decimal weights.
- [ ] Validation errors (Under-allocation check) are compatible with float sums.
