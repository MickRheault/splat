# Issue: Gemini LLM Category Detection

Status: open

## Parent

PRD: `docs/prd/group-purchases-splitting.md`

## What to build

Update the Gemini OCR prompt in the backend API to classify receipts:
- Modify `/api/ocr.ts` prompt description and schema rules to extract a `"category"` property.
- Constrain the output value to one of the 8 canonical categories: `food_drink`, `groceries`, `transport_fuel`, `lodging`, `tickets_entertainment`, `shopping`, `activities`, `general`.
- Map this parsed category into the store items loading logic.

## Acceptance criteria

- [ ] Gemini API returns valid category strings.
- [ ] OCR test suite passes with category checking.
- [ ] Unknown or missing categories default to `food_drink`.
