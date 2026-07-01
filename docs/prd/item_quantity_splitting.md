# Product Requirements Document (PRD): Item Quantity-Based Splitting

## Problem Statement

When scanning receipts or entering items manually, Splat assumes each item is a single, indivisible line. However, receipts often group identical items together with a count (e.g., "3 - Beer : 15$"). Currently, Splat users have to manually duplicate rows or split the total cost evenly among all selected participants. There is no way to assign specific quantities (e.g., Participant A drank 2 beers, Participant B drank 1 beer) without doing external math or manual line duplication, which degrades the splitting experience.

## Solution

Support structured item quantities throughout Splat:
1. Update the Gemini OCR prompt to extract both the `quantity` (default 1) and the total line `price` ($15.00 for 3 beers).
2. Allow editing item details (including quantity) via a settings modal for each item on the Edit Items page.
3. In Step 3 (Allocate), if an item has a quantity of 1, keep the existing quick inline toggle. If an item has a quantity > 1, tapping it opens a detail modal with `+`/`-` counters next to each participant to assign exact quantities.
4. Enforce that the sum of assigned quantities equals the item's total quantity before allowing the user to proceed to the summary screen.

## User Stories

1. As a group diner, I want the OCR scanner to recognize quantity counts from the receipt, so that I don't have to manually duplicate items.
2. As a user, I want the OCR-extracted item price to represent the total price of all quantities combined, so that the bill total matches the receipt total exactly.
3. As a user, I want to edit an item's quantity manually via a detail settings modal, so that I can correct any OCR mistakes or add quantity counts to manually entered items.
4. As a user, I want tapping on a single-quantity item (quantity = 1) to toggle assignment to the active participant instantly, so that the workflow remains extremely fast for simple receipts.
5. As a user, I want tapping on a multi-quantity item (quantity > 1) to open an allocation modal, so that I can specify exactly how many units each person consumed.
6. As a user, I want the allocation modal to display the unit price and the remaining unassigned quantity on the fly, so that I can easily see how many items are left to allocate.
7. As a user, I want the allocation modal to have intuitive `+` and `-` buttons for each participant, so that I can increment or decrement their share of the item quickly.
8. As a user, I want to see a clear warning and be blocked from proceeding to the summary step if there are any unassigned item units, so that the bill allocation is perfectly complete and error-free.
9. As a participant, I want my share of a multi-quantity item to be calculated proportionally to the quantity I consumed, so that I only pay for what I actually had.
10. As a user, I want the final share summary to display the breakdown of my item shares (including individual item counts), so that the summary is clear and transparent.

## Implementation Decisions

- **Schema Changes**:
  - Update `Item` interface to include `quantity: number` (defaulting to 1).
  - Update `Item` interface to replace/extend assignment tracking. We will add `assignedQuantities: Record<string, number>` (mapping participantId to quantity).
  - Maintain `assignedTo: string[]` as a derived property (or synchronous array) representing all participant IDs with an assigned quantity > 0 for backward compatibility with existing views.
- **OCR Prompts**:
  - Modify Vercel serverless function (`api/ocr.ts`) and client-side development parser (`src/store.ts`) Gemini prompts. Add `quantity` field to the output JSON `items` array. Specify that the `price` field must represent the total price of all units on that line.
- **UI Components & Interactions**:
  - **Edit Items (Step 1)**: Add a settings/cog icon next to each item row. Clicking it opens a modal containing input fields for item Name, Price, and Quantity.
  - **Assign Items (Step 3)**:
    - If `item.quantity === 1`, tap toggles the active participant in/out of `assignedTo` (no modal).
    - If `item.quantity > 1`, tap opens a detail dialog/modal containing the participant list with `+`/`-` counters.
    - Validate that for all items, the sum of `assignedQuantities` values equals the item's `quantity`. Show a warning banner and disable the "Next" navigation button if validation fails.
- **Calculation Logic**:
  - Unify cost calculation in `store.ts`. A participant's share of an item is calculated as:
    `itemShareCost = (assignedQuantity / item.quantity) * item.price`
    where `assignedQuantity` is retrieved from `item.assignedQuantities[participantId]` (defaulting to 1 for single-quantity items where the participant is in `assignedTo`).

## Testing Decisions

- Only test external behavior and core calculation logic, not DOM implementation details.
- **Store Unit Tests**:
  - Verify that `store.setParticipantCount`, OCR parsing, and final calculations work correctly with quantity-based items.
  - Test calculation logic for mixed items (some quantity = 1, some quantity > 1).
  - Test validation logic that enforces all quantities are fully allocated.
- **Prior Art**:
  - Follow the testing style in `src/store.test.ts` using Vitest to mock the OCR results and test the store actions.

## Out of Scope

- Support for fractional/decimal quantities (e.g. allocating 1.5 of an item). Only integer quantities are supported.
- Storing unit prices in the database—all database operations will store total item price and total quantity, calculating unit prices dynamically on the fly.

## Further Notes

- Ensure the user interface remains responsive and follows Splat's sleek dark aesthetic.
