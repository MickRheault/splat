# Issue: Manual Currency Selection Override

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Allow users to customize the active currency symbol:
- Create a currency symbol configuration dropdown next to the Bill Name or Bill Total input in Step 2.
- The dropdown should support common symbols: Dollar (`$`), Euro (`€`), Pound (`£`), Baht (`฿`), Yen/Yuan (`¥`), and Won (`₩`).
- Selection changes should immediately update `store.currencySymbol`.
- Ensure all calculations and formats inherit this selected currency dynamically.

## Acceptance criteria

- [ ] Currency selector is available in the Edit Items header layout.
- [ ] Changing the selection updates the active symbol used in item price tags, totals, breakdown dialogues, and plaintext share outputs.
- [ ] Default values are still set correctly by OCR parsing outcomes if available.
