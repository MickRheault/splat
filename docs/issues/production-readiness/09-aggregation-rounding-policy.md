# Issue: Aggregation Rounding Policy

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Ensure rounding is done late to prevent compounding errors:
- Review that individual item allocation values (e.g. `(count / qty) * price`) remain as raw floats during summation into participant subtotals.
- Round to two decimal places only during final subtotal, tax, and tip mappings.
- Ensure that the rounded share prices displayed in itemized lists are for display purposes only.

## Acceptance criteria

- [ ] Subtotal calculations sum raw floating point allocation weights instead of pre-rounded item shares.
- [ ] No compounding rounding errors are generated when splitting many items.
