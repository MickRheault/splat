# Issue: Participant Deletion & Allocation Rebalancing

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Handle allocation updates when a Participant is removed:
- When a Participant is deleted, clear all their corresponding Allocations and Assigned Quantities.
- If an Item was split evenly (`isSplitEvenly = true`), rebalance the even split among remaining assigned Participants.
- If an Item was split unevenly (`isSplitEvenly = false`), do not auto-reallocate. Instead, mark the Item as Under-allocated and present an error warning on the allocation step to prevent finishing splits.

## Acceptance criteria

- [ ] Deleting a Participant clears all their Assigned Quantities.
- [ ] If `isSplitEvenly` is false, deleting a Participant who held allocations leaves the Item under-allocated and raises validation errors.
- [ ] Split cannot be completed (cannot advance to Step 4) if any Item remains under-allocated.
