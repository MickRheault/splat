# Issue: Payer Designation & Sharing Formatter

Status: open

## Parent

PRD: `docs/prd/group-purchases-splitting.md`

## What to build

Designate a single bill payer and customize the plaintext sharing output:
- Add a "Paid By" dropdown selector in Step 2 to designate who paid the overall Bill.
- Default the selection to the first Participant (index 0, e.g., "Me").
- Modify the Plain-Text Share Summary formatter in `src/store.ts` to output "Participant owes Payer: $X" format.

## Acceptance criteria

- [ ] Payer selector is available in the Step 2 configuration panel.
- [ ] Share plaintext summary clearly specifies the payer name and who owes them.
- [ ] Share summary remains fully functional.
