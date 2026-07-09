# Issue: Category Presets UI & Default Split Modes

Status: open

## Parent

PRD: `docs/prd/group-purchases-splitting.md`

## What to build

Implement the category selectors and presets logic in the client app:
- Add a dropdown selector in Step 2 to manually override the Bill's Category.
- Use category properties to update default split modes:
  - If category changes to `transport_fuel` or `lodging`, default all multi-quantity items to `isSplitEvenly = true`.
  - If category changes to `tickets_entertainment`, default multi-quantity items to split by quantity (`isSplitEvenly = false`).
- Render category-specific icons on the share details panel and saved split history cards.

## Acceptance criteria

- [ ] Category dropdown is visible in the Bill Name configuration block in Step 2.
- [ ] Selecting a category updates the default split mode configurations for all newly added items.
- [ ] Category icons render cleanly on the final share view.
