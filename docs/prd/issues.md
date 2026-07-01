# Implementation Issues: Item Quantity-Based Splitting

This document lists the vertical implementation slices for the item quantity-based splitting feature.

---

## Issue 1: Schema & Core State Math
### Parent
[item_quantity_splitting.md](file:///Users/mick/workspace/personal/splat/docs/prd/item_quantity_splitting.md)

### What to build
Update the `Item` schema interface and core calculation logic in `src/store.ts` to support quantity-based cost division.

### Acceptance criteria
- [ ] Add `quantity: number` (defaults to 1) to the `Item` interface.
- [ ] Add `assignedQuantities: Record<string, number>` to the `Item` interface.
- [ ] Keep `assignedTo: string[]` in sync with the keys of `assignedQuantities` (e.g., participants with count > 0).
- [ ] Update the store's participant cost calculations. Proportional division: `(assignedQuantity / item.quantity) * item.price` for items with quantity > 1. Fall back to equal split for quantity = 1.
- [ ] Ensure all existing store unit tests pass under the new schema.

### Blocked by
None - can start immediately

---

## Issue 2: Step 1 Details Modal (Manual Quantity Edit)
### Parent
[item_quantity_splitting.md](file:///Users/mick/workspace/personal/splat/docs/prd/item_quantity_splitting.md)

### What to build
Add a detail settings modal for individual items in the Edit Items (Step 1) view to support manual quantity editing.

### Acceptance criteria
- [ ] Add a cog/settings icon next to each item row on the Edit Items page.
- [ ] Clicking the icon opens a modal sheet displaying editable Name, Price, and Quantity fields.
- [ ] Saving the modal updates the item properties in the store and local storage.
- [ ] Ensure manual row additions default to a quantity of 1.

### Blocked by
- [Issue 1](#issue-1-schema--core-state-math)

---

## Issue 3: Step 3 Multi-Quantity Allocation Modal
### Parent
[item_quantity_splitting.md](file:///Users/mick/workspace/personal/splat/docs/prd/item_quantity_splitting.md)

### What to build
Implement the allocation detail modal in Step 3 for items with quantity > 1.

### Acceptance criteria
- [ ] Tapping an item in Step 3 where `item.quantity === 1` toggles participant assignment directly in the list (existing inline flow).
- [ ] Tapping an item where `item.quantity > 1` opens a detail modal.
- [ ] The modal displays: Item Name, Unit Price, Total Price, and remaining unassigned quantity.
- [ ] The modal lists all participants with `+`/`-` buttons to increment/decrement their assigned quantity count.
- [ ] Saving the modal updates `item.assignedQuantities` in the store.

### Blocked by
- [Issue 1](#issue-1-schema--core-state-math)
- [Issue 2](#issue-2-step-1-details-modal-manual-quantity-edit)

---

## Issue 4: Allocation Validation & Navigation Enforcement
### Parent
[item_quantity_splitting.md](file:///Users/mick/workspace/personal/splat/docs/prd/item_quantity_splitting.md)

### What to build
Add allocation completeness validation that blocks proceeding if item quantities are not fully allocated.

### Acceptance criteria
- [ ] Verify that the sum of all `assignedQuantities` values exactly equals `item.quantity` for each item.
- [ ] Display an allocation warning badge/text (e.g., "1 Beer unassigned") next to items in Step 3 that fail this validation.
- [ ] Disable the step navigation "Next" button if any item fails validation.
- [ ] Display a helpful validation warning banner at the top of the step.

### Blocked by
- [Issue 3](#issue-3-step-3-multi-quantity-allocation-modal)

---

## Issue 5: Step 4 Summary & Share Breakdown
### Parent
[item_quantity_splitting.md](file:///Users/mick/workspace/personal/splat/docs/prd/item_quantity_splitting.md)

### What to build
Display the item count breakdown on the summary screen and the final share text block.

### Acceptance criteria
- [ ] Show count details on the final participant summary screen (e.g., "2x Beer: $10.00").
- [ ] Format the copied share clipboard message to include quantity descriptions (e.g., "- 2x Beer ($10.00)").

### Blocked by
- [Issue 3](#issue-3-step-3-multi-quantity-allocation-modal)

---

## Issue 6: Gemini OCR Prompt & Ingestion
### Parent
[item_quantity_splitting.md](file:///Users/mick/workspace/personal/splat/docs/prd/item_quantity_splitting.md)

### What to build
Update Vercel backend (`api/ocr.ts`) and frontend (`src/store.ts`) Gemini prompts to extract item counts and total line price.

### Acceptance criteria
- [ ] Update Gemini instructions to output an optional `quantity: number` field (defaulting to 1).
- [ ] Instruct Gemini to output the total line price in the `price` field.
- [ ] Update store OCR response handler to map the extracted quantity to the item properties in the store.

### Blocked by
- [Issue 2](#issue-2-step-1-details-modal-manual-quantity-edit)
